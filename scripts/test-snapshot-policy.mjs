import path from 'node:path'
import ts from 'typescript'

const normalizingHelpers = new Set(['cloneState', 'cloneStateWithHistory', 'normalizeState'])

const wrapped = node => {
  while (ts.isParenthesizedExpression(node.parent)) node = node.parent
  return node
}

export function snapshotSourcePartition(program, includedFiles) {
  const root = program.getCurrentDirectory()
  const checker = program.getTypeChecker()
  const canonical = symbol => symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol)
  const files = new Map(program.getSourceFiles().filter(source => {
    const relative = path.relative(root, source.fileName)
    return includedFiles.has(path.resolve(source.fileName)) && !source.isDeclarationFile
      && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
      && !relative.split(path.sep).includes('node_modules') && /\.[cm]?[jt]sx?$/.test(source.fileName)
  }).map(source => [path.resolve(source.fileName), source]))
  const runtime = new Set()
  const seed = (module, names) => {
    const source = program.getSourceFile(path.join(root, module))
    const symbol = source && checker.getSymbolAtLocation(source)
    for (const item of symbol ? checker.getExportsOfModule(symbol) : []) {
      if (!names.has(item.name)) continue
      for (const declaration of canonical(item)?.declarations ?? []) {
        const file = path.resolve(declaration.getSourceFile().fileName)
        if (files.has(file)) runtime.add(file)
      }
    }
  }
  seed('server/game/authoritative-session.ts', new Set(['GameSession']))
  seed('shared/session/session-core.ts', new Set(['GameCore']))
  seed('shared/session/state-bootstrap.ts', normalizingHelpers)
  const pending = [...runtime]
  while (pending.length) {
    const source = files.get(pending.pop())
    const edge = module => {
      if (!ts.isStringLiteralLike(module)) return
      const symbol = canonical(checker.getSymbolAtLocation(module))
      for (const declaration of symbol?.declarations ?? []) {
        const file = path.resolve(declaration.getSourceFile().fileName)
        if (files.has(file) && !runtime.has(file)) { runtime.add(file); pending.push(file) }
      }
    }
    function visit(node) {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause
        const typeOnly = clause?.isTypeOnly || clause && !clause.name
          && clause.namedBindings && ts.isNamedImports(clause.namedBindings)
          && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every(item => item.isTypeOnly)
        if (!typeOnly) edge(node.moduleSpecifier)
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const typeOnly = node.isTypeOnly || node.exportClause && ts.isNamedExports(node.exportClause)
          && node.exportClause.elements.length > 0 && node.exportClause.elements.every(item => item.isTypeOnly)
        if (!typeOnly) edge(node.moduleSpecifier)
      } else if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly
        && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression) edge(node.moduleReference.expression)
      else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0]) edge(node.arguments[0])
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return { runtimeFiles: [...runtime].sort(), observationFiles: [...files.keys()].filter(file => !runtime.has(file)).sort() }
}

export function normalizingSnapshotViolations(source, file, program) {
  if (!program) throw new Error('Snapshot policy requires an explicit TypeScript Program')
  const parsed = program.getSourceFile(path.resolve(file))
  if (!parsed) throw new Error(`Snapshot policy source is absent from the compiler Program: ${file}`)
  if (parsed.text !== source) throw new Error(`Snapshot policy source differs from the compiler Program: ${file}`)
  const checker = program.getTypeChecker()
  const canonical = symbol => symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol)
  const exported = (module, name) => {
    const declaration = program.getSourceFile(path.join(program.getCurrentDirectory(), module))
    const symbol = declaration && checker.getSymbolAtLocation(declaration)
    return symbol && canonical(checker.getExportsOfModule(symbol).find(item => item.name === name))
  }
  const normalizers = new Map([...normalizingHelpers].flatMap(name => {
    const symbol = exported('shared/session/state-bootstrap.ts', name)
    return symbol ? [[symbol, name]] : []
  }))
  const session = exported('server/game/authoritative-session.ts', 'GameSession')
  const core = exported('shared/session/session-core.ts', 'GameCore')
  const sessionClasses = new Set([session, core].filter(Boolean))
  const subject = exported('server/__tests__/_helpers/normalization-subject.ts', 'normalizationSubject')
  const symbolAt = node => canonical(ts.isShorthandPropertyAssignment(node.parent)
    ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node))
  const isSession = (type, seen = new Set()) => {
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown) || seen.has(type)) return false
    if (type.isUnion()) return type.types.every(member => isSession(member, new Set(seen)))
    if (type.isIntersection()) return type.types.some(member => isSession(member, new Set(seen)))
    if (sessionClasses.has(canonical(type.getSymbol()))) return true
    seen.add(type)
    return (type.getBaseTypes?.() ?? []).some(base => isSession(base, seen))
  }
  const isLoadState = node => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)
      || node.expression.name.text !== 'loadState') return false
    const receiver = checker.getTypeAtLocation(node.expression.expression)
    const method = symbolAt(node.expression.name)
    return isSession(receiver) && method?.declarations?.some(declaration =>
      ts.isMethodDeclaration(declaration) && sessionClasses.has(canonical(checker.getSymbolAtLocation(declaration.parent.name))))
  }
  const constructorOwner = node => {
    if (!ts.isNewExpression(node) || !isSession(checker.getTypeAtLocation(node))) return undefined
    const declaration = checker.getResolvedSignature(node)?.declaration
    return declaration && ts.isConstructorDeclaration(declaration) && declaration.parent.name
      ? canonical(checker.getSymbolAtLocation(declaration.parent.name)) : undefined
  }
  const property = (value, name) => ts.isPropertyAssignment(value.parent)
    && value.parent.initializer === value && value.parent.name.getText(parsed).replace(/^['"]|['"]$/g, '') === name
    && ts.isObjectLiteralExpression(value.parent.parent) ? wrapped(value.parent.parent) : undefined
  const coreState = value => {
    const options = property(value, 'stateOrSeed')
    return core && options && ts.isNewExpression(options.parent) && options.parent.arguments?.[0] === options
      && constructorOwner(options.parent) === core
  }
  const stateValue = value => {
    if (ts.isCallExpression(value.parent) && value.parent.arguments[0] === value && isLoadState(value.parent)) return true
    if (session && ts.isNewExpression(value.parent) && value.parent.arguments?.[0] === value && constructorOwner(value.parent) === session) return true
    return coreState(value)
  }
  const usedByRestore = node => {
    const callee = wrapped(node)
    if (!ts.isCallExpression(callee.parent) || callee.parent.expression !== callee) return false
    const value = wrapped(callee.parent)
    if (stateValue(value)) return true
    const container = property(value, 'state')
    return container && stateValue(container)
  }
  const isSubjectArgument = node => subject && ts.isCallExpression(node.parent)
    && node.parent.arguments[0] === node && symbolAt(node.parent.expression) === subject
  const isNormalizingNamespace = symbol => symbol && (symbol.flags & ts.SymbolFlags.Module)
    && checker.getExportsOfModule(symbol).some(item => normalizers.has(canonical(item)))
  const violations = []
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node)) return
    let helper
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const module = checker.getAwaitedType(checker.getTypeAtLocation(node))?.getSymbol()
      let use = node
      let awaited = false
      while (ts.isAwaitExpression(use.parent) || ts.isParenthesizedExpression(use.parent)) {
        if (ts.isAwaitExpression(use.parent)) awaited = true
        use = use.parent
      }
      const directMember = awaited && (ts.isPropertyAccessExpression(use.parent) && use.parent.expression === use
        || ts.isElementAccessExpression(use.parent) && use.parent.expression === use && ts.isStringLiteralLike(use.parent.argumentExpression))
      if (isNormalizingNamespace(canonical(module)) && !directMember) helper = 'state-bootstrap namespace'
    }
    else if (ts.isIdentifier(node)) {
      // The enclosing member access reports its symbol once.
      if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node
        || ts.isBindingElement(node.parent) && node.parent.propertyName === node) return
      const symbol = symbolAt(node)
      helper = normalizers.get(symbol)
      if (isNormalizingNamespace(symbol)) {
        const member = node.parent
        if (!(ts.isPropertyAccessExpression(member) && member.expression === node)
          && !(ts.isElementAccessExpression(member) && member.expression === node
            && ts.isStringLiteralLike(member.argumentExpression))) helper = 'state-bootstrap namespace'
      }
    }
    else if (ts.isPropertyAccessExpression(node)) helper = normalizers.get(symbolAt(node))
    else if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) {
      helper = normalizers.get(canonical(checker.getTypeAtLocation(node.expression).getProperty(node.argumentExpression.text)))
    }
    if (helper && !isSubjectArgument(node) && !usedByRestore(node)) {
      const { line, character } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed))
      violations.push({ file, line: line + 1, column: character + 1, helper,
        message: helper === 'state-bootstrap namespace'
          ? 'Import individual state-bootstrap helpers instead of passing, destructuring, or dynamically indexing the namespace; use captureStateWithHistory for observations.'
          : `${helper} normalizes state; use captureStateWithHistory for observations. Keep normalization inside a real Session constructor or loadState call, or mark the normalizer itself with normalizationSubject.` })
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return violations
}
