import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { coverPrefixes, isVitestSource, prefixMatches, repositoryFiles } from './ci/test-covers'
import { parseSource, sourceExtensions, walkSourceFiles } from './source-files'

// A Vitest file or test helper that runs a repository script in a child process must declare `// @covers` for it.
// The import graph cannot see those scripts, so the routine plan selects such a test only through the declaration.

export type TestCoversViolation = { file: string; line: number; script: string; message: string }

const CHILD_PROCESS = new Set(['node:child_process', 'child_process'])
const SPAWNERS = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'execSync'])
const SHELL_COMMAND = new Set(['execSync'])
const INTERPRETERS = new Set(['node', 'bash', 'sh', 'zsh', 'env', 'tsx', 'npx', 'pnpm'])
const SCRIPT = /\.(?:[cm]?ts|mjs|sh)$/
const UNKNOWN = '\u0000'
const ANCHOR = '\u0001'

const unwrap = (expression: ts.Expression): ts.Expression => {
  while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)) expression = expression.expression
  return expression
}

function calleeName(expression: ts.Expression): string | undefined {
  const current = unwrap(expression)
  if (ts.isIdentifier(current)) return current.text
  if (ts.isPropertyAccessExpression(current)) return current.name.text
  return undefined
}

function isImportMeta(expression: ts.Expression, member: string): boolean {
  return ts.isPropertyAccessExpression(expression) && expression.name.text === member
    && ts.isMetaProperty(expression.expression)
}

// Evaluates an expression to the strings it can hold. Unknown pieces become UNKNOWN; ANCHOR marks a repository-relative path.
function evaluator(source: ts.SourceFile, file: string) {
  const declarations = new Map<string, ts.Expression[]>()
  const parameters = new Map<string, { callee: string; index: number }[]>()
  const calls = new Map<string, ts.CallExpression[]>()
  const recordParameters = (callee: string, fn: ts.SignatureDeclarationBase): void => {
    fn.parameters.forEach((parameter, index) => {
      if (!ts.isIdentifier(parameter.name) || parameter.dotDotDotToken) return
      parameters.set(parameter.name.text, [...parameters.get(parameter.name.text) ?? [], { callee, index }])
    })
  }
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      declarations.set(node.name.text, [...declarations.get(node.name.text) ?? [], node.initializer])
      const initializer = unwrap(node.initializer)
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) recordParameters(node.name.text, initializer)
    }
    if (ts.isFunctionDeclaration(node) && node.name) recordParameters(node.name.text, node)
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      calls.set(node.expression.text, [...calls.get(node.expression.text) ?? [], node])
    }
    ts.forEachChild(node, collect)
  }
  collect(source)
  const directory = path.posix.dirname(file)
  const single = (values: string[]): string => values.length === 1 ? values[0]! : UNKNOWN
  const joined = (parts: string[], resolve: boolean): string => {
    let result = ''
    for (const part of parts) {
      if (resolve && part.startsWith('/')) result = part
      else result = result ? `${result}/${part}` : part
      if (resolve && part.startsWith(ANCHOR)) result = part
    }
    return result
  }
  const evaluate = (input: ts.Expression, seen: ReadonlySet<string> = new Set()): string[] => {
    const expression = unwrap(input)
    if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)
      && ts.isIdentifier(expression.expression.expression) && expression.expression.expression.text === 'process'
      && expression.expression.name.text === 'cwd') return [ANCHOR]
    if (ts.isStringLiteralLike(expression)) return [expression.text]
    if (isImportMeta(expression, 'dirname')) return [`${ANCHOR}${directory}`]
    if (isImportMeta(expression, 'url')) return [`${ANCHOR}${file}`]
    if (ts.isIdentifier(expression)) {
      if (expression.text === '__dirname') return [`${ANCHOR}${directory}`]
      if (seen.has(expression.text)) return []
      const next = new Set(seen).add(expression.text)
      const assigned = (declarations.get(expression.text) ?? []).flatMap(initializer => evaluate(initializer, next))
      // A parameter takes the arguments its function receives at the call sites in this file.
      const passed = (parameters.get(expression.text) ?? []).flatMap(({ callee, index }) => (calls.get(callee) ?? [])
        .flatMap(call => call.arguments[index] && !ts.isSpreadElement(call.arguments[index]) ? evaluate(call.arguments[index], next) : []))
      return [...assigned, ...passed]
    }
    if (ts.isPropertyAccessExpression(expression)) {
      if (ts.isIdentifier(expression.expression) && expression.expression.text === 'process' && expression.name.text === 'execPath') return ['node']
      if (expression.name.text === 'href' || expression.name.text === 'pathname') return evaluate(expression.expression, seen)
      return []
    }
    if (ts.isConditionalExpression(expression)) return [...evaluate(expression.whenTrue, seen), ...evaluate(expression.whenFalse, seen)]
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return [single(evaluate(expression.left, seen)) + single(evaluate(expression.right, seen))]
    }
    if (ts.isTemplateExpression(expression)) {
      return [expression.templateSpans.reduce((text, span) => text + single(evaluate(span.expression, seen)) + span.literal.text, expression.head.text)]
    }
    if (ts.isArrayLiteralExpression(expression)) {
      return expression.elements.flatMap(element => evaluate(ts.isSpreadElement(element) ? element.expression : element, seen))
    }
    if (ts.isNewExpression(expression) && calleeName(expression.expression) === 'URL' && expression.arguments?.length === 2) {
      const [relative, base] = expression.arguments.map(argument => single(evaluate(argument, seen)))
      return [joined([base!.endsWith('/') ? base! : path.posix.dirname(base!), relative!], true)]
    }
    if (ts.isCallExpression(expression)) {
      const name = calleeName(expression.expression)
      const args = expression.arguments.map(argument => single(evaluate(argument, seen)))
      if (name === 'join' || name === 'resolve') return [joined(args, name === 'resolve')]
      if (name === 'dirname' && args.length === 1) return [path.posix.dirname(args[0]!)]
      if ((name === 'fileURLToPath' || name === 'pathToFileURL') && args.length === 1) return [args[0]!]
    }
    return []
  }
  // The call's working directory: the repository root without a cwd option, otherwise the anchored cwd when known.
  const workingDirectory = (call: ts.CallExpression): string | undefined => {
    const options = call.arguments.slice(1).map(unwrap).find(ts.isObjectLiteralExpression)
    if (!options) return call.arguments.slice(1).every(argument => ts.isArrayLiteralExpression(unwrap(argument))) ? ANCHOR : undefined
    const property = options.properties.find(member => member.name && ts.isIdentifier(member.name) && member.name.text === 'cwd')
    if (!property) return options.properties.some(ts.isSpreadAssignment) ? undefined : ANCHOR
    const value = ts.isShorthandPropertyAssignment(property) ? evaluate(property.name)
      : ts.isPropertyAssignment(property) ? evaluate(property.initializer) : []
    return value.length === 1 && value[0]!.startsWith(ANCHOR) && !value[0]!.includes(UNKNOWN) ? value[0] : undefined
  }
  return { evaluate, workingDirectory }
}

// `cwd` is the anchored working directory of the call, or undefined when the test cannot know it statically.
function scriptCandidates(value: string, cwd: string | undefined, files: ReadonlySet<string>, byName: ReadonlyMap<string, string[]>): string[] {
  const unknownPrefix = value.includes(UNKNOWN)
  const tail = value.slice(value.lastIndexOf(UNKNOWN) + 1)
  return tail.split(/[\s'"`;()]+/).flatMap(token => {
    if (!SCRIPT.test(token)) return []
    const anchored = token.lastIndexOf(ANCHOR)
    const exactPath = (relative: string) => {
      const exact = path.posix.normalize(relative).replace(/^\/+/, '')
      return files.has(exact) ? [exact] : []
    }
    if (anchored >= 0) return exactPath(token.slice(anchored + 1))
    if (!unknownPrefix && !token.startsWith('/') && cwd !== undefined) return exactPath(`${cwd}/${token}`)
    if (!token.includes('/')) return []
    const suffix = path.posix.normalize(token).replace(/^(?:\.\.?\/|\/)+/, '')
    if (!suffix || suffix.startsWith('..')) return []
    const named = byName.get(path.posix.basename(suffix)) ?? []
    // A copied tree such as <tmp>/policy/scripts/x.ts names the repository file by its longest matching suffix,
    // but a nested path never shrinks to a bare file name.
    const segments = suffix.split('/')
    for (let start = 0; start === 0 || segments.length - start >= 2; start++) {
      const tail = segments.slice(start).join('/')
      const matched = named.filter(candidate => candidate === tail || candidate.endsWith(`/${tail}`))
      if (matched.length) return matched
      if (start >= segments.length - 1) break
    }
    return []
  })
}

function packageScripts(root: string): Record<string, string> {
  const manifest = path.join(root, 'package.json')
  if (!fs.existsSync(manifest)) return {}
  return (JSON.parse(fs.readFileSync(manifest, 'utf8')) as { scripts?: Record<string, string> }).scripts ?? {}
}

// Returns the strings that name what the call executes, or nothing when the command is external (git, docker, …).
function executed(command: string[], args: string[], scripts: Record<string, string>): string[] {
  const head = command.length === 1 ? command[0]! : UNKNOWN
  const program = head.split(/[\\/]/).pop() ?? ''
  if (SCRIPT.test(head)) return [head, ...args]
  if (program === 'pnpm') {
    const positional = args.filter(arg => !arg.startsWith('-'))
    const name = positional[0] === 'run' ? positional[1] : positional[0]
    if (name && scripts[name] !== undefined) return [scripts[name]!]
    return args
  }
  if (INTERPRETERS.has(program) || head.endsWith('/.bin/tsx') || head.endsWith('/tsx/dist/cli.mjs')) return args
  return []
}

export function findTestCoversViolations(root: string): TestCoversViolation[] {
  const sources = walkSourceFiles(root, sourceExtensions, true, 'skip-non-source')
    .map(file => path.relative(root, file).split(path.sep).join('/'))
    .filter(isVitestSource)
  const files = new Set(repositoryFiles(root))
  const byName = new Map<string, string[]>()
  for (const file of files) byName.set(path.posix.basename(file), [...byName.get(path.posix.basename(file)) ?? [], file])
  const scripts = packageScripts(root)
  const violations: TestCoversViolation[] = []
  for (const file of sources) {
    const text = fs.readFileSync(path.join(root, file), 'utf8')
    if (!text.includes('child_process')) continue
    const source = parseSource(path.join(root, file))
    const names = new Map<string, string>()
    const namespaces = new Set<string>()
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
      if (!CHILD_PROCESS.has(statement.moduleSpecifier.text) || statement.importClause?.isTypeOnly) continue
      const clause = statement.importClause
      if (clause?.name) namespaces.add(clause.name.text)
      const binding = clause?.namedBindings
      if (binding && ts.isNamespaceImport(binding)) namespaces.add(binding.name.text)
      else if (binding) for (const element of binding.elements) {
        const original = (element.propertyName ?? element.name).text
        if (SPAWNERS.has(original) && !element.isTypeOnly) names.set(element.name.text, original)
      }
    }
    if (!names.size && !namespaces.size) continue
    const prefixes = coverPrefixes(text)
    const { evaluate, workingDirectory } = evaluator(source, file)
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = unwrap(node.expression)
        const spawner = ts.isIdentifier(callee) ? names.get(callee.text)
          : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && namespaces.has(callee.expression.text)
            && SPAWNERS.has(callee.name.text) ? callee.name.text : undefined
        const [first, second] = node.arguments
        if (spawner && first) {
          let command = evaluate(first)
          let args = second && !SHELL_COMMAND.has(spawner) ? evaluate(second) : []
          if (SHELL_COMMAND.has(spawner)) {
            const tokens = (command.length === 1 ? command[0]! : UNKNOWN).trim().split(/\s+/)
            command = tokens.slice(0, 1)
            args = tokens.slice(1)
          }
          const groups = new Map<string, string[]>()
          const cwd = workingDirectory(node)
          const base = cwd === undefined ? undefined : cwd.slice(ANCHOR.length)
          for (const value of executed(command, args, scripts)) {
            const candidates = scriptCandidates(value, base, files, byName)
            if (candidates.length) groups.set(candidates.join(' '), candidates)
          }
          for (const candidates of groups.values()) {
            if (candidates.some(candidate => prefixes.some(prefix => prefixMatches(prefix, candidate)))) continue
            const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
            violations.push({
              file,
              line,
              script: candidates[0]!,
              message: `${file}:${line} runs ${candidates.join(' or ')} in a child process; declare it with a leading // @covers comment`,
            })
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return violations
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
  const violations = findTestCoversViolations(root)
  for (const violation of violations) console.error(violation.message)
  if (violations.length) {
    console.error(`${violations.length} child-process script runs lack @covers`)
    process.exit(1)
  }
  console.log('Every child-process repository script run has a matching @covers declaration')
}
