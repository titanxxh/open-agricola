import path from 'node:path'
import ts from 'typescript'

const normalizingHelpers = new Set(['cloneState', 'cloneStateWithHistory', 'normalizeState'])

const usedByRestore = (node, isRestoreBoundary) => {
  for (let parent = node.parent; parent && !ts.isStatement(parent) && !ts.isFunctionLike(parent); parent = parent.parent) {
    if (isRestoreBoundary(parent)) return true
  }
  return false
}

export function normalizingSnapshotViolations(source, file) {
  const filename = path.resolve(file)
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true)
  const imports = parsed.statements.filter(node => ts.isImportDeclaration(node)
    && /(?:^|\/)state-bootstrap(?:\.[cm]?[jt]s)?$/.test(node.moduleSpecifier.text)
    && !node.importClause?.isTypeOnly)
  if (!imports.length) return []
  const options = { noResolve: true, noLib: true }
  const host = ts.createCompilerHost(options)
  host.getSourceFile = name => path.resolve(name) === filename ? parsed : undefined
  host.fileExists = name => path.resolve(name) === filename
  host.readFile = name => path.resolve(name) === filename ? source : undefined
  const checker = ts.createProgram([filename], options, host).getTypeChecker()
  const constructors = new Set()
  for (const declaration of parsed.statements) {
    if (!ts.isImportDeclaration(declaration) || declaration.importClause?.isTypeOnly
      || !/(?:^|\/)(?:authoritative-session|session-core)(?:\.[cm]?[jt]s)?$/.test(declaration.moduleSpecifier.text)) continue
    const bindings = declaration.importClause?.namedBindings
    if (bindings && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) {
        if (!binding.isTypeOnly && ['GameSession', 'SessionCore'].includes(binding.propertyName?.text ?? binding.name.text)) {
          constructors.add(checker.getSymbolAtLocation(binding.name))
        }
      }
    }
  }
  const isRestoreBoundary = node =>
    (ts.isNewExpression(node) && ts.isIdentifier(node.expression)
      && constructors.has(checker.getSymbolAtLocation(node.expression)))
    || (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'loadState')
  const named = new Map()
  const namespaces = new Set()
  for (const declaration of imports) {
    const bindings = declaration.importClause?.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(checker.getSymbolAtLocation(bindings.name))
    else if (bindings && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) {
        const helper = binding.propertyName?.text ?? binding.name.text
        if (!binding.isTypeOnly && normalizingHelpers.has(helper)) named.set(checker.getSymbolAtLocation(binding.name), helper)
      }
    }
  }
  const violations = []
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isTypeNode(node)) return
    let helper
    if (ts.isIdentifier(node)) {
      const symbol = ts.isShorthandPropertyAssignment(node.parent)
        ? checker.getShorthandAssignmentValueSymbol(node.parent)
        : checker.getSymbolAtLocation(node)
      helper = named.get(symbol)
      if (namespaces.has(symbol)) {
        const member = node.parent
        if (!(ts.isPropertyAccessExpression(member) && member.expression === node)
          && !(ts.isElementAccessExpression(member) && member.expression === node
            && ts.isStringLiteralLike(member.argumentExpression))) helper = 'state-bootstrap namespace'
      }
    }
    else if (ts.isPropertyAccessExpression(node) && normalizingHelpers.has(node.name.text)
      && namespaces.has(checker.getSymbolAtLocation(node.expression))) helper = node.name.text
    else if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)
      && normalizingHelpers.has(node.argumentExpression.text)
      && namespaces.has(checker.getSymbolAtLocation(node.expression))) helper = node.argumentExpression.text
    if (helper && !usedByRestore(node, isRestoreBoundary)) {
      const { line, character } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed))
      violations.push({ file, line: line + 1, column: character + 1, helper,
        message: helper === 'state-bootstrap namespace'
          ? 'Import individual state-bootstrap helpers instead of passing, destructuring, or dynamically indexing the namespace; use captureStateWithHistory for observations.'
          : `${helper} normalizes state; use captureStateWithHistory for observations. Keep normalization inside an explicit GameSession constructor or loadState call.` })
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return violations
}
