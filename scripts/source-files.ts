import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

export const sourceExtensions = /\.[cm]?[jt]sx?$/
const ignoredDirectories = new Set(['node_modules', '.git', '.worktree', 'dist', '.build', 'coverage', 'playwright-report', 'test-results'])

export function walkSourceFiles(directory: string, extensions = sourceExtensions, recursive = true): string[] {
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error(`source symlink requires explicit ownership: ${directory}`)
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (ignoredDirectories.has(entry.name)) return []
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return recursive ? walkSourceFiles(file, extensions) : []
    if (entry.isSymbolicLink()) throw new Error(`source symlink requires explicit ownership: ${file}`)
    if (!entry.isFile()) throw new Error(`unsupported source entry: ${file}`)
    return extensions.test(entry.name) ? [file] : []
  }).sort()
}

export function parseSource(file: string): ts.SourceFile {
  const scriptKind = file.endsWith('jsx') ? ts.ScriptKind.JSX : file.endsWith('tsx') ? ts.ScriptKind.TSX : undefined
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, scriptKind)
  const diagnostics = (source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics
  if (diagnostics.length) throw new Error(`${file}: ${diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('; ')}`)
  return source
}
