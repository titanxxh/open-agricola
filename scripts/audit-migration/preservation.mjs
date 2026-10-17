import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'

const printer = ts.createPrinter({ removeComments: true })
const render = (node, source) => printer.printNode(ts.EmitHint.Unspecified, node, source)
const rootName = expression => ts.isIdentifier(expression) ? expression.text
  : ts.isCallExpression(expression) || ts.isPropertyAccessExpression(expression) ? rootName(expression.expression) : ''
const queryMethods = new Set(['map', 'filter', 'every', 'some', 'find', 'findIndex', 'includes', 'slice', 'at', 'getState', 'getStateForRead', 'getInteraction'])
const staticQueries = new Set(['Object.keys', 'Object.values', 'Object.entries', 'Object.fromEntries', 'Array.from', 'JSON.stringify', 'Number.isInteger', 'Number.isFinite'])
const globalQueries = new Set(['Object', 'Array', 'JSON', 'Number', 'String', 'Boolean', 'BigInt'])
const assertMethods = new Set(['ok', 'equal', 'notEqual', 'deepEqual', 'notDeepEqual', 'strictEqual', 'notStrictEqual', 'deepStrictEqual', 'notDeepStrictEqual', 'match', 'doesNotMatch', 'throws', 'doesNotThrow', 'rejects', 'doesNotReject', 'ifError', 'fail'])
const matchers = new Set(['toBe', 'toEqual', 'toStrictEqual', 'toBeDefined', 'toBeUndefined', 'toBeNull', 'toBeTruthy', 'toBeFalsy', 'toBeNaN', 'toBeGreaterThan', 'toBeGreaterThanOrEqual', 'toBeLessThan', 'toBeLessThanOrEqual', 'toBeCloseTo', 'toContain', 'toContainEqual', 'toHaveLength', 'toHaveProperty', 'toMatch', 'toMatchObject', 'toThrow', 'toThrowError', 'toBeInstanceOf'])

function assertionCall(expression, assertionNames) {
  if (!ts.isCallExpression(expression)) return false
  const name = rootName(expression.expression)
  const kind = assertionNames.get(name)
  const callee = expression.expression
  if (kind === 'assert') return ts.isIdentifier(callee)
    || (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && assertMethods.has(callee.name.text))
  if (kind !== 'expect' || !ts.isPropertyAccessExpression(callee) || !matchers.has(callee.name.text)) return false
  const receiver = ts.isPropertyAccessExpression(callee.expression) && callee.expression.name.text === 'not'
    ? callee.expression.expression : callee.expression
  return ts.isCallExpression(receiver) && ts.isIdentifier(receiver.expression) && receiver.expression.text === name
}

function parse(text, file) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  if (source.parseDiagnostics.length) throw new Error(`Cannot certify invalid TypeScript: ${file}`)
  const assertionNames = new Map()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const module = statement.moduleSpecifier.text
    const clause = statement.importClause
    if (['node:assert', 'node:assert/strict'].includes(module) && clause?.name) assertionNames.set(clause.name.text, 'assert')
    const named = clause?.namedBindings
    if (!named || !ts.isNamedImports(named)) continue
    for (const binding of named.elements) {
      const imported = binding.propertyName?.text ?? binding.name.text
      if (module === 'vitest' && imported === 'expect') assertionNames.set(binding.name.text, 'expect')
      if (['node:assert', 'node:assert/strict'].includes(module) && imported === 'strict') assertionNames.set(binding.name.text, 'assert')
    }
  }
  if (!assertionNames.size) throw new Error(`No supported assertion import: ${file}`)
  const checkBindings = node => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)
      || ts.isImportSpecifier(node) || ts.isNamespaceImport(node) || ts.isImportClause(node)) && node.name) {
      const checkName = name => {
        if (ts.isIdentifier(name) && globalQueries.has(name.text)) throw new Error(`Query global is shadowed: ${file}:${name.text}`)
        if (!ts.isImportSpecifier(node) && !ts.isImportClause(node) && ts.isIdentifier(name) && assertionNames.has(name.text)) throw new Error(`Assertion import is shadowed: ${file}:${name.text}`)
        ts.forEachChild(name, checkName)
      }
      checkName(node.name)
    }
    ts.forEachChild(node, checkBindings)
  }
  checkBindings(source)
  const isAssertion = node => ts.isExpressionStatement(node) && assertionCall(node.expression, assertionNames)
    && (ts.isSourceFile(node.parent) || ts.isBlock(node.parent) || ts.isCaseClause(node.parent) || ts.isDefaultClause(node.parent))
  const slots = new Map()
  const visit = (node, location) => {
    let index = 0
    ts.forEachChild(node, child => {
      if (isAssertion(child)) {
        const key = `${location}/${index}`
        const values = slots.get(key) ?? []
        values.push({ text: render(child, source), node: child })
        slots.set(key, values)
      } else {
        visit(child, `${location}/${child.kind}:${index}`)
        index++
      }
    })
  }
  visit(source, 'source')
  const result = ts.transform(source, [context => node => {
    const strip = child => isAssertion(child) ? undefined : ts.visitEachChild(child, strip, context)
    return ts.visitNode(node, strip)
  }])
  const protectedText = printer.printFile(result.transformed[0])
  result.dispose()
  return { source, slots, protectedText, assertionNames }
}

function checkAddedAssertion(node, parsed, file) {
  const walk = child => {
    if (ts.isAwaitExpression(child) || ts.isYieldExpression(child) || ts.isNewExpression(child) || ts.isTaggedTemplateExpression(child)
      || ts.isClassExpression(child) || ts.isClassDeclaration(child)
      || ts.isAsExpression(child) || ts.isTypeAssertionExpression(child) || child.kind === ts.SyntaxKind.AnyKeyword
      || ts.isDeleteExpression(child) || ts.isPostfixUnaryExpression(child)
      || (ts.isPrefixUnaryExpression(child) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(child.operator))
      || (ts.isBinaryExpression(child) && child.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && child.operatorToken.kind <= ts.SyntaxKind.LastAssignment)) throw new Error(`Added assertion contains a mutation or execution boundary: ${file}`)
    if (ts.isCallExpression(child)) {
      const expression = child.expression
      const name = rootName(expression)
      const safe = assertionCall(child, parsed.assertionNames)
        || (parsed.assertionNames.get(name) === 'expect' && ts.isIdentifier(expression))
        || (ts.isIdentifier(expression) && ['Number', 'String', 'Boolean', 'BigInt'].includes(expression.text))
        || staticQueries.has(expression.getText(parsed.source))
        || (ts.isPropertyAccessExpression(expression) && queryMethods.has(expression.name.text))
      if (!safe) throw new Error(`Uncertified call in added assertion: ${file}: ${expression.getText(parsed.source)}`)
    }
    ts.forEachChild(child, walk)
  }
  walk(node)
}

/** A deliberately narrow structural proof. It does not certify rule semantics. */
export function preserveAssertions(before, after, file = 'scenario.test.ts') {
  const baseline = parse(before, file)
  const candidate = parse(after, file)
  if (baseline.protectedText !== candidate.protectedText) throw new Error(`Non-assertion syntax changed; cannot certify assertions-only repair: ${file}`)
  let retained = 0
  let added = 0
  for (const [slot, assertions] of baseline.slots) {
    const current = candidate.slots.get(slot) ?? []
    let index = 0
    for (const assertion of current) {
      if (index < assertions.length && assertion.text === assertions[index].text) { index++; retained++ }
      else { checkAddedAssertion(assertion.node, candidate, file); added++ }
    }
    if (index !== assertions.length) throw new Error(`Original assertion removed, changed or moved across a command/branch: ${file}`)
  }
  for (const [slot, assertions] of candidate.slots) {
    if (baseline.slots.has(slot)) continue
    for (const assertion of assertions) { checkAddedAssertion(assertion.node, candidate, file); added++ }
  }
  return { file, retainedAssertions: retained, addedAssertions: added }
}

export function checkPreservation(root, options) {
  const base = options.get('base')
  const head = options.get('head')
  const input = options.get('files')
  if (!base || !head || !input) throw new Error('preserve requires --base commit --head commit --files JSON-file-list')
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  const resolve = value => git('rev-parse', '--verify', `${value}^{commit}`).trim()
  const baseCommit = resolve(base)
  const headCommit = resolve(head)
  const files = JSON.parse(fs.readFileSync(input, 'utf8'))
  if (!Array.isArray(files) || !files.length || new Set(files).size !== files.length
    || files.some(file => typeof file !== 'string' || !file.endsWith('.test.ts') || path.posix.normalize(file) !== file
      || path.isAbsolute(file) || file.includes('\\') || file.split('/').includes('..'))) throw new Error('files must list unique canonical relative .test.ts paths')
  const changed = git('diff', '--name-only', '--no-renames', '-z', baseCommit, headCommit).split('\0').filter(Boolean)
  const omitted = changed.filter(file => !files.includes(file))
  if (omitted.length) throw new Error(`Assertions-only diff contains undeclared files: ${omitted.join(', ')}`)
  const results = files.map(file => preserveAssertions(git('show', `${baseCommit}:${file}`), git('show', `${headCommit}:${file}`), file))
  return { mode: 'assertions-only', base: baseCommit, head: headCommit, files: results,
    limits: 'Static assertion additions only. Fixture, driver, loop, import, title or original assertion changes are rejected. This does not prove missing inputs, correct expectations or runtime purity.' }
}
