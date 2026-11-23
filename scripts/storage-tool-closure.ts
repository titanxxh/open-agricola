import { isBuiltin } from 'node:module'
import path from 'node:path'
import ts from 'typescript'
import { normalizePath, resolveImport } from './architecture-policy.mjs'
import { parseSource } from './source-files'

/**
 * The backup commands the pre trusted-policy tool image and the daily host
 * backup run. Their code is the static runtime import closure of the entry
 * below, which must stay free of rule and game code so the image can be
 * reused by tool content (#2024, #2022).
 */
export const STORAGE_TOOL_ENTRY = 'scripts/storage-archive-cli.ts'
export const STORAGE_TOOL_COMMANDS = ['export', 'export-online', 'ledger-export', 'ledger-merge', 'cleanup-scratch'] as const

/** Rule engine, actions, cards, sessions and the game server. */
export const STORAGE_TOOL_FORBIDDEN = /^(?:shared\/(?:cards|engine|actions|session|parents|seasons|moor)|server\/game)\//

/**
 * Repository files or directories the closure reads at runtime outside its
 * import graph, such as migration SQL. None today: the commands read only
 * caller-supplied paths and host files, listed per module below.
 */
export const STORAGE_TOOL_RUNTIME_FILES: readonly string[] = []

/**
 * Every closure module that reads files, starts workers or imports code at
 * runtime, and what it touches. A new such module must be declared here.
 */
export const STORAGE_TOOL_RUNTIME_ACCESS: Readonly<Record<string, string>> = {
  'scripts/storage-archive-cli.ts': 'Ledger JSON at the argument path or CURRENT_ERASURE_LEDGER; imports scripts/storage-restore.ts only for validate, restore and check-live',
  'scripts/storage-archive.ts': 'Archive directory at the argument path',
  'scripts/backup-scratch.ts': 'Scratch records in the argument record directory',
  'scripts/ci/docker-bind-user.ts': 'Host file /run/oa-ci-isolation/context.json, on the rootless GitHub CI runner only',
}

/** Engine-backed modules the entry imports lazily; the five commands never load them. */
export const STORAGE_TOOL_LAZY_IMPORTS: Readonly<Record<string, string>> = {
  'scripts/storage-restore.ts': 'validate, restore and check-live decode replays with the rule engine',
}

const RUNTIME_ACCESS = /\b(?:readFileSync|readFile|readdirSync|createReadStream|Worker)\b|import\.meta\.(?:dirname|filename)/

export type StorageToolClosure = {
  /** Repository modules, sorted. */
  files: string[]
  /** npm packages imported by those modules, sorted. */
  packages: string[]
  /** Dynamic `import()` targets, not followed. */
  lazyImports: string[]
  /** Closure modules whose source matches a runtime file, worker or code access. */
  runtimeAccess: string[]
}

const packageName = (specifier: string) => specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/')

/**
 * Follows value imports and re-exports. `import type` and `export type` are
 * erased under verbatimModuleSyntax; `import { type X }` is not, so it is followed.
 */
export function storageToolClosure(root: string, entry = STORAGE_TOOL_ENTRY): StorageToolClosure {
  const files = new Set([entry]), packages = new Set<string>(), lazyImports = new Set<string>(), runtimeAccess = new Set<string>()
  const queue = [entry]
  const resolve = (specifier: string, from: string): string | null => {
    if (isBuiltin(specifier)) return null
    const resolved = resolveImport(specifier, path.join(root, from))
    if (!resolved || resolved.includes('/node_modules/')) {
      if (specifier.startsWith('.')) throw new Error(`${from}: unresolved import ${specifier}`)
      packages.add(packageName(specifier))
      return null
    }
    return normalizePath(path.relative(root, resolved))
  }
  while (queue.length) {
    const file = queue.shift()!
    const source = parseSource(path.join(root, file))
    if (RUNTIME_ACCESS.test(source.text)) runtimeAccess.add(file)
    const follow = (specifier: string) => {
      const target = resolve(specifier, file)
      if (target && !files.has(target)) { files.add(target); queue.push(target) }
    }
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        if (!node.importClause?.isTypeOnly) follow(node.moduleSpecifier.text)
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        if (!node.isTypeOnly) follow(node.moduleSpecifier.text)
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const [argument] = node.arguments
        if (!argument || !ts.isStringLiteralLike(argument)) throw new Error(`${file}: dynamic import needs a literal specifier`)
        const target = resolve(argument.text, file)
        if (target) lazyImports.add(target)
      } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        throw new Error(`${file}: require() is not followed by the storage tool closure`)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  const sorted = (values: Set<string>) => [...values].sort()
  return { files: sorted(files), packages: sorted(packages), lazyImports: sorted(lazyImports), runtimeAccess: sorted(runtimeAccess) }
}
