import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { parseSource, walkSourceFiles } from './source-files'

export type TestRuleEnvironmentViolation = {
  file: string
  line: number
  kind: 'session-global-official-fixture' | 'session-before-hook-registry-publication' | 'async-rule-scope'
  message: string
}

const scanRoots = ['shared', 'server', 'client', 'scripts', 'tests', 'e2e-tests']
const sessionNames = new Set(['GameSession', 'GameCore', 'LocalSandboxCore', 'createWorkSession', 'createOpeningSession', 'createIsolatedGameSession'])
const trackedNames = new Set([...sessionNames, 'installOfficialCardRegistry', 'setActiveCardRegistry', 'beforeEach', 'beforeAll', 'withActiveRegistry'])
const isTest = (file: string): boolean => file.includes('/__tests__/') || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)

const unwrap = (expression: ts.Expression): ts.Expression => {
  while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)) expression = expression.expression
  return expression
}

type Callback = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration

export function findTestRuleEnvironmentViolations(root: string): TestRuleEnvironmentViolation[] {
  const violations: TestRuleEnvironmentViolation[] = []
  for (const directory of scanRoots) {
    const full = path.join(root, directory)
    if (!fs.existsSync(full)) throw new Error(`missing test-environment source root: ${directory}`)
    const files = walkSourceFiles(full)
    if (!files.length) throw new Error(`empty test-environment source root: ${directory}`)
    for (const file of files) {
      const relative = path.relative(root, file).split(path.sep).join('/')
      const source = parseSource(file)
      const names = new Map<string, string>()
      const namespaces = new Set<string>()
      const variables: ts.VariableDeclaration[] = []
      const callbacks = new Map<string, ts.Expression | ts.FunctionDeclaration>()
      const calls: ts.CallExpression[] = []
      const constructions: ts.NewExpression[] = []
      let sessionMixed = relative.startsWith('server/') && isTest(relative)
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue
        const binding = statement.importClause?.namedBindings
        if (!binding) continue
        if (ts.isNamespaceImport(binding)) namespaces.add(binding.name.text)
        else for (const imported of binding.elements) {
          if (imported.isTypeOnly) continue
          const original = (imported.propertyName ?? imported.name).text
          if (trackedNames.has(original)) names.set(imported.name.text, original)
          if (sessionNames.has(original)) sessionMixed = true
        }
      }
      const symbol = (expression: ts.Expression): string | undefined => {
        const current = unwrap(expression)
        if (ts.isIdentifier(current)) return names.get(current.text) ?? (trackedNames.has(current.text) ? current.text : undefined)
        if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
          const receiver = unwrap(current.expression)
          const member = ts.isPropertyAccessExpression(current) ? current.name.text
            : current.argumentExpression && ts.isStringLiteral(current.argumentExpression) ? current.argumentExpression.text : undefined
          if (member && ts.isIdentifier(receiver) && namespaces.has(receiver.text) && trackedNames.has(member)) return member
          if (member === 'withCtx') return 'withCtx'
        }
        return undefined
      }
      const collect = (node: ts.Node): void => {
        if (ts.isVariableDeclaration(node) && node.initializer) {
          variables.push(node)
          if (ts.isIdentifier(node.name)) callbacks.set(node.name.text, node.initializer)
        }
        if (ts.isFunctionDeclaration(node) && node.name) callbacks.set(node.name.text, node)
        if (ts.isCallExpression(node)) calls.push(node)
        if (ts.isNewExpression(node)) constructions.push(node)
        ts.forEachChild(node, collect)
      }
      collect(source)
      // Resolve ordinary local aliases without importing or executing test code.
      let changed = true
      while (changed) {
        changed = false
        for (const declaration of variables) {
          if (!declaration.initializer) continue
          const initial = unwrap(declaration.initializer)
          if (ts.isIdentifier(declaration.name)) {
            const name = symbol(initial)
            if (name && !names.has(declaration.name.text)) { names.set(declaration.name.text, name); changed = true }
            if (ts.isIdentifier(initial) && namespaces.has(initial.text) && !namespaces.has(declaration.name.text)) {
              namespaces.add(declaration.name.text); changed = true
            }
          } else if (ts.isObjectBindingPattern(declaration.name) && ts.isIdentifier(initial) && namespaces.has(initial.text)) {
            for (const entry of declaration.name.elements) {
              if (!ts.isIdentifier(entry.name)) continue
              const name = (entry.propertyName ?? entry.name).getText(source)
              if (trackedNames.has(name) && !names.has(entry.name.text)) { names.set(entry.name.text, name); changed = true }
            }
          }
        }
      }
      if (calls.some(call => sessionNames.has(symbol(call.expression) ?? ''))) sessionMixed = true
      if (constructions.some(call => sessionNames.has(symbol(call.expression) ?? ''))) sessionMixed = true
      const resolveCallback = (expression: ts.Expression | undefined, seen = new Set<string>()): Callback | undefined => {
        if (!expression) return undefined
        const current = unwrap(expression)
        if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) return current
        if (!ts.isIdentifier(current) || seen.has(current.text)) return undefined
        seen.add(current.text)
        const target = callbacks.get(current.text)
        return target && (ts.isFunctionDeclaration(target) ? target : resolveCallback(target, seen))
      }
      const setupCallbacks = new Set<ts.Node>(calls.filter(call => ['beforeEach', 'beforeAll'].includes(symbol(call.expression) ?? ''))
        .map(call => resolveCallback(call.arguments[0])).filter(callback => callback !== undefined))
      const inSetup = (node: ts.Node): boolean => {
        for (let parent = node.parent; parent; parent = parent.parent) if (setupCallbacks.has(parent)) return true
        return false
      }
      const report = (node: ts.Node, kind: TestRuleEnvironmentViolation['kind'], message: string): void => {
        violations.push({ file: relative, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, kind, message })
      }
      for (const call of calls) {
        const name = symbol(call.expression)
        if (isTest(relative) && sessionMixed && name === 'installOfficialCardRegistry') {
          report(call, 'session-global-official-fixture', 'Session tests must use the actual session.withCtx around direct queries; remove the blanket official-card fixture.')
        }
        const published = call.arguments[0]
        if (isTest(relative) && sessionMixed && name === 'setActiveCardRegistry' && inSetup(call)
          && (!published || unwrap(published).kind !== ts.SyntaxKind.NullKeyword)) {
          report(call, 'session-before-hook-registry-publication', 'beforeEach/beforeAll must not publish a non-null CardRegistry for Session tests; register injected rules in the owning session.withCtx.')
        }
        if (name === 'withCtx' || name === 'withActiveRegistry') {
          const callback = resolveCallback(call.arguments[name === 'withCtx' ? 0 : 1])
          if (callback?.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword)) {
            report(call, 'async-rule-scope', 'Rule registry scopes are synchronous; move await outside withCtx/withActiveRegistry and bind only the synchronous rule query.')
          }
        }
      }
    }
  }
  return violations
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'))
  const violations = findTestRuleEnvironmentViolations(root)
  for (const violation of violations) console.error(`${violation.file}:${violation.line} [${violation.kind}] ${violation.message}`)
  console.log(`Test rule environment check: ${violations.length} violation(s)`)
  process.exitCode = violations.length ? 1 : 0
}
