import path from 'node:path'
import ts from 'typescript'

const normalizingHelpers = new Set(['cloneState', 'cloneStateWithHistory', 'normalizeState'])

const usedByRestore = (node, isRestoreBoundary) => {
  for (let parent = node.parent; parent && !ts.isStatement(parent) && !ts.isFunctionLike(parent); parent = parent.parent) {
    if (isRestoreBoundary(parent)) return true
  }
  return false
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
  const sessionClasses = new Set([
    exported('server/game/authoritative-session.ts', 'GameSession'),
    exported('shared/session/session-core.ts', 'GameCore'),
  ].filter(Boolean))
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
  const isRestoreBoundary = node => {
    if (ts.isNewExpression(node)) return isSession(checker.getTypeAtLocation(node))
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)
      || node.expression.name.text !== 'loadState') return false
    const receiver = checker.getTypeAtLocation(node.expression.expression)
    const method = symbolAt(node.expression.name)
    return isSession(receiver) && method?.declarations?.some(declaration =>
      ts.isMethodDeclaration(declaration) && sessionClasses.has(canonical(checker.getSymbolAtLocation(declaration.parent.name))))
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
    if (helper && !isSubjectArgument(node) && !usedByRestore(node, isRestoreBoundary)) {
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
