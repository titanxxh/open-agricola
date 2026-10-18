import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { parseSource, walkSourceFiles } from './source-files'

export type TestStateCopyViolation = {
  file: string
  line: number
  kind: 'normalizing-copy' | 'stale-exemption'
  message: string
}

const scanRoots = ['shared', 'server', 'client', 'scripts', 'tests', 'e2e-tests']
// These helpers end in normalizeState, which can fill in fields the tested
// response never contained. Observed values are copied with
// captureStateWithHistory instead.
const normalizingHelpers = new Set(['cloneState', 'cloneStateWithHistory', 'normalizeState'])
const isStateBootstrap = (specifier: string): boolean => /(^|\/)state-bootstrap(\.[cm]?[jt]s)?$/.test(specifier)
const isTest = (file: string): boolean => file.includes('/__tests__/') || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)

/** Tests whose subject is normalization or normalized restoration itself. */
const exemptions = [
  { file: 'shared/session/__tests__/state-clone.test.ts', reason: 'Tests cloneState itself.' },
  { file: 'shared/session/__tests__/state-normalize-stats.test.ts', reason: 'Tests normalizeState itself.' },
  { file: 'shared/session/__tests__/fence-segments-normalize.test.ts', reason: 'Tests normalizeState itself.' },
  { file: 'shared/session/__tests__/starting-food.test.ts', reason: 'Tests how normalizeState restores the Snake Opening marker.' },
  { file: 'shared/session/__tests__/event-state.test.ts', reason: 'Tests how normalizeState repairs persisted event state.' },
  { file: 'server/__tests__/state-clone-preview-session.test.ts', reason: 'Tests cloneState on a live session state.' },
  { file: 'server/__tests__/player-count-action-spaces.test.ts', reason: 'Tests that normalizeState keeps player-count filtering.' },
] as const

const unwrapParent = (node: ts.Node): ts.Node => {
  let current = node
  while (ts.isParenthesizedExpression(current.parent) || ts.isAsExpression(current.parent)
    || ts.isSatisfiesExpression(current.parent) || ts.isNonNullExpression(current.parent)) current = current.parent
  return current
}

/** `new GameSession({ state: cloneState(previous) })` restores, rather than observes, a state. */
const isRestoreInput = (reference: ts.Expression): boolean => {
  const call = reference.parent
  if (!ts.isCallExpression(call) || call.expression !== reference) return false
  const property = unwrapParent(call).parent
  if (!property || !ts.isPropertyAssignment(property) || property.initializer !== unwrapParent(call)) return false
  if (!ts.isIdentifier(property.name) || property.name.text !== 'state') return false
  const options = property.parent
  const construction = options.parent
  return ts.isNewExpression(construction) && construction.arguments?.[0] === options
    && ts.isIdentifier(construction.expression) && construction.expression.text === 'GameSession'
}

export function findTestStateCopyViolations(root: string): TestStateCopyViolation[] {
  const violations: TestStateCopyViolation[] = []
  const exempted = new Set<string>()
  for (const directory of scanRoots) {
    const full = path.join(root, directory)
    if (!fs.existsSync(full)) throw new Error(`missing test-state-copy source root: ${directory}`)
    const files = walkSourceFiles(full)
    if (!files.length) throw new Error(`empty test-state-copy source root: ${directory}`)
    for (const file of files) {
      const relative = path.relative(root, file).split(path.sep).join('/')
      if (!isTest(relative)) continue
      const source = parseSource(file)
      const names = new Map<string, string>()
      const namespaces = new Set<string>()
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue
        if (!ts.isStringLiteral(statement.moduleSpecifier) || !isStateBootstrap(statement.moduleSpecifier.text)) continue
        const binding = statement.importClause?.namedBindings
        if (!binding) continue
        if (ts.isNamespaceImport(binding)) namespaces.add(binding.name.text)
        else for (const imported of binding.elements) {
          const original = (imported.propertyName ?? imported.name).text
          if (!imported.isTypeOnly && normalizingHelpers.has(original)) names.set(imported.name.text, original)
        }
      }
      if (!names.size && !namespaces.size) continue
      // `const { cloneState: copy } = bootstrap` binds a helper from a namespace import.
      const collectDestructured = (node: ts.Node): void => {
        if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer) {
          let initializer: ts.Expression = node.initializer
          while (ts.isParenthesizedExpression(initializer) || ts.isAsExpression(initializer)
            || ts.isSatisfiesExpression(initializer) || ts.isNonNullExpression(initializer)) initializer = initializer.expression
          if (ts.isIdentifier(initializer) && namespaces.has(initializer.text)) for (const element of node.name.elements) {
            const property = element.propertyName ?? element.name
            const original = ts.isIdentifier(property) ? property.text : ts.isStringLiteral(property) ? property.text : undefined
            if (original && normalizingHelpers.has(original) && ts.isIdentifier(element.name)) names.set(element.name.text, original)
          }
        }
        ts.forEachChild(node, collectDestructured)
      }
      collectDestructured(source)
      const exemption = exemptions.find(entry => entry.file === relative)
      const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node)) return
        let helper: string | undefined
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
          && namespaces.has(node.expression.text) && normalizingHelpers.has(node.name.text)) helper = node.name.text
        else if (ts.isIdentifier(node) && names.has(node.text)
          && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
          && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)
          && !ts.isBindingElement(node.parent)) helper = names.get(node.text)
        if (helper && ts.isExpression(node)) {
          if (exemption) exempted.add(exemption.file)
          else if (!isRestoreInput(node)) violations.push({
            file: relative,
            line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
            kind: 'normalizing-copy',
            message: `${helper} normalizes the copied state; copy observed values with captureStateWithHistory`,
          })
          return
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
  }
  for (const exemption of exemptions) {
    if (!exempted.has(exemption.file)) violations.push({
      file: exemption.file,
      line: 1,
      kind: 'stale-exemption',
      message: `no normalizing helper use remains; remove the exemption (${exemption.reason})`,
    })
  }
  return violations
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = findTestStateCopyViolations(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))
  if (violations.length === 0) {
    console.log('[check-test-state-copies] tests copy observed states without normalizing them')
    process.exit(0)
  }
  console.error(`[check-test-state-copies] ${violations.length} violations:`)
  for (const violation of violations) console.error(`  ${violation.file}:${violation.line} [${violation.kind}] ${violation.message}`)
  process.exit(1)
}
