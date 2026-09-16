import path from 'node:path'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { isBuiltin } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { walkSourceFiles, parseSource } from './source-files.ts'
import { importViolation, isSourceFile, isTestFile, normalizePath, resolveImport, browserDataFiles, workerFiles, privilegedRoots } from './architecture-policy.mjs'

export type DependencyEdge = { from: string; to: string; typeOnly: boolean; dynamic: boolean }
export const runtimeRoots = ['shared', 'server', 'client', 'replay-viewer/src']

const knownRoots = new Set(['shared', 'server', 'client', 'replay-viewer', 'scripts', 'tests', 'e2e-tests'])
const artifacts = new Set(['node_modules', '.git', '.worktree', 'dist', 'data', 'output', 'public', 'docs', 'coverage', 'playwright-report', 'test-results', '.codex', '.agents'])

/**
 * Top-level entries that git ignores (`.gitignore`, `.git/info/exclude`, global
 * excludes). `git check-ignore` exits 1 when nothing matches and 128 outside a
 * checkout; both fall back to "nothing ignored" so the plain scan still applies.
 * Tracked paths are never reported as ignored, so a committed directory keeps
 * failing the classification even if a later ignore rule matches it.
 */
const gitIgnoredEntries = (root: string, names: readonly string[]): Set<string> => {
  if (names.length === 0) return new Set()
  const output = ((): string => {
    try {
      return execFileSync('git', ['check-ignore', '-z', '--stdin'], {
        cwd: root,
        encoding: 'utf8',
        input: names.join('\0') + '\0',
        stdio: ['pipe', 'pipe', 'ignore'],
      })
    } catch (error) {
      const stdout = (error as { stdout?: unknown }).stdout
      return typeof stdout === 'string' ? stdout : ''
    }
  })()
  return new Set(output.split('\0').filter(Boolean))
}

/** Top-level directories holding sources that belong to no known root and are not git-ignored. */
export function unclassifiedSourceRoots(root: string): string[] {
  const candidates = fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !knownRoots.has(entry.name) && !artifacts.has(entry.name))
    .map(entry => entry.name)
    .sort()
  const ignored = gitIgnoredEntries(root, candidates)
  return candidates.filter(name => !ignored.has(name) && walkSourceFiles(path.join(root, name)).length > 0)
}

const isImportMetaUrl = (node: ts.Node | undefined): boolean =>
  !!node && ts.isPropertyAccessExpression(node) && node.name.text === 'url'
  && ts.isMetaProperty(node.expression) && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword

export function readDependencies(root: string, roots = runtimeRoots): { edges: DependencyEdge[]; errors: string[]; files: string[] } {
  const files = roots.flatMap(dir => walkSourceFiles(path.join(root, dir))).filter(file => !isTestFile(normalizePath(path.relative(root, file))) && !file.endsWith('.d.ts'))
  const scanned = new Set(files.map(file => path.resolve(file)))
  const edges: DependencyEdge[] = []
  const errors: string[] = []
  const workerEntries = new Set<string>()
  if (roots === runtimeRoots) {
    for (const name of unclassifiedSourceRoots(root)) errors.push('unclassified source root: ' + name)
    for (const file of [...browserDataFiles.keys(), ...workerFiles, ...privilegedRoots.keys()]) {
      if (!fs.existsSync(path.join(root, file))) errors.push('stale architecture permission: ' + file)
    }
  }
  for (const file of files) {
    const from = normalizePath(path.relative(root, file))
    const source = parseSource(file)
    const add = (specifier: ts.Expression, typeOnly: boolean, dynamic = false) => {
      if (!ts.isStringLiteralLike(specifier)) {
        errors.push(`${from}: nonliteral module dependency cannot be checked`)
        return
      }
      const resolved = resolveImport(specifier.text, file)
      const to = resolved ? normalizePath(path.relative(root, resolved)) : specifier.text
      if (!resolved && !isBuiltin(specifier.text) && !/\.(?:css|svg|png|jpg|webp|md)(?:\?.*)?$/.test(specifier.text)) errors.push(`${from}: unresolved dependency ${specifier.text}`)
      const violation = importViolation(from, to, specifier.text, typeOnly)
      if (violation) errors.push(`${from} -> ${to}: ${violation}`)
      if (resolved && !to.includes('node_modules/')) {
        if (!typeOnly && isSourceFile(resolved) && !scanned.has(path.resolve(resolved))) errors.push(from + ': runtime dependency outside scan scope: ' + to)
        if (!to.startsWith('../')) edges.push({ from, to, typeOnly, dynamic })
      }
    }
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause
        add(node.moduleSpecifier, !!clause?.isTypeOnly)
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        add(node.moduleSpecifier, node.isTypeOnly)
      } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        if (node.arguments[0]) add(node.arguments[0], false, node.expression.kind === ts.SyntaxKind.ImportKeyword)
      } else if (ts.isNewExpression(node)) {
        const name = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : ''
        const argument = node.arguments?.[0]
        if (['Worker', 'SharedWorker'].includes(name) && (from.startsWith('client/') || from.startsWith('replay-viewer/'))) {
          if (!argument || !ts.isNewExpression(argument) || !ts.isIdentifier(argument.expression) || argument.expression.text !== 'URL'
            || !argument.arguments?.[0] || !ts.isStringLiteralLike(argument.arguments[0])
            || !isSourceFile(argument.arguments[0].text) || !isImportMetaUrl(argument.arguments[1])) errors.push(from + ': uncheckable worker entry')
        }
        const base = node.arguments?.[1]
        if (name === 'URL' && isImportMetaUrl(base)) {
          if (!argument || !ts.isStringLiteralLike(argument)) errors.push(from + ': nonliteral module URL cannot be checked')
          else if (isSourceFile(argument.text)) {
            const worker = normalizePath(path.relative(root, path.resolve(path.dirname(file), argument.text)))
            workerEntries.add(worker)
            if (from !== 'client/local-sandbox/local-transport.ts' || worker !== 'client/local-sandbox/worker.ts') errors.push(from + ': unknown worker entry ' + worker)
          }
        }
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression) {
        add(node.moduleReference.expression, node.isTypeOnly)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  if (roots === runtimeRoots) {
    const targets = new Set(edges.filter(edge => !edge.typeOnly).map(edge => edge.to))
    for (const file of [...workerFiles, ...privilegedRoots.keys()]) {
      if (!targets.has(file) && !workerEntries.has(file)) errors.push('unused architecture permission: ' + file)
    }
  }
  return { files: files.map(file => normalizePath(path.relative(root, file))), edges, errors }
}

export function dependencyCycles(edges: readonly DependencyEdge[]): string[][] {
  const graph = new Map<string, Set<string>>()
  for (const { from, to, typeOnly } of edges) {
    if (typeOnly) continue
    if (!graph.has(from)) graph.set(from, new Set())
    graph.get(from)!.add(to)
  }
  let next = 0
  const indexes = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const active = new Set<string>()
  const cycles: string[][] = []
  const visit = (node: string): void => {
    indexes.set(node, next)
    low.set(node, next++)
    stack.push(node)
    active.add(node)
    for (const target of graph.get(node) ?? []) {
      if (!indexes.has(target)) {
        visit(target)
        low.set(node, Math.min(low.get(node)!, low.get(target)!))
      } else if (active.has(target)) low.set(node, Math.min(low.get(node)!, indexes.get(target)!))
    }
    if (low.get(node) !== indexes.get(node)) return
    const component: string[] = []
    let member: string
    do {
      member = stack.pop()!
      active.delete(member)
      component.push(member)
    } while (member !== node)
    if (component.length > 1 || graph.get(node)?.has(node)) cycles.push(component.sort())
  }
  for (const node of graph.keys()) if (!indexes.has(node)) visit(node)
  return cycles.sort((a, b) => a[0]!.localeCompare(b[0]!))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, '..')
  const result = readDependencies(root)
  const cycles = dependencyCycles(result.edges)
  if (process.argv.includes('--json')) console.log(JSON.stringify({ ...result, cycles }, null, 2))
  else {
    for (const error of result.errors) console.error(error)
    for (const cycle of cycles) console.error(`runtime dependency cycle:\n  ${cycle.join('\n  ')}`)
    console.log(`[check:dependencies] ${result.files.length} files, ${cycles.length} runtime cycles, ${result.errors.length} boundary errors`)
  }
  process.exitCode = result.errors.length || cycles.length ? 1 : 0
}
