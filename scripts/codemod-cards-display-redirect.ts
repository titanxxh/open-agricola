// Codemod: redirect display-const imports from cards-impl bridges to cards-display.
//
// Input:  caller files importing { X } from '.../shared/cards/<deck>/<file>'
// Output: same files with display-const bindings rewritten to '.../shared/cards-display/<deck>/<file>',
//         while _impl bindings and helper bindings stay on the cards/ path.
//
// Rules per named binding:
//   - matches /^[A-E]\d+_[A-Z][A-Za-z0-9]*$/  → display const → redirect to cards-display
//   - matches /^[A-E]\d+_[A-Z][A-Za-z0-9]*_impl$/ → impl → stays on cards/
//   - else (helpers, etc.) → stays on cards/
//
// If an import has zero display bindings, the line is untouched.
// If an import has only display bindings, the path is rewritten in place.
// Mixed imports are split into 2 lines: display first (cards-display), rest second (cards/).

import * as ts from 'typescript'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { dirname, join, resolve, relative } from 'path'
import { fileURLToPath } from 'url'

const CARDS_PATH_RE = /^(.*\/)shared\/cards\/([A-E])\/([A-Z]\d+_[A-Za-z0-9]+)$/
const CARD_BINDING_RE = /^[A-E]\d+_[A-Z][A-Za-z0-9]*$/
const CARD_IMPL_BINDING_RE = /^[A-E]\d+_[A-Z][A-Za-z0-9]*_impl$/

export interface RewriteInput {
  sourcePath: string
  sourceText: string
}

export interface RewriteResult {
  text: string
  changed: boolean
  rewrittenLines: number
}

interface Edit {
  start: number
  end: number
  replacement: string
}

interface NamedBindingRaw {
  name: string
  raw: string // original text including alias e.g. "A28_ForestSchool as A28Card"
}

const parseNamedBindings = (
  clause: ts.ImportClause,
  sf: ts.SourceFile,
): NamedBindingRaw[] | null => {
  if (!clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return null
  return clause.namedBindings.elements.map((el) => ({
    name: el.name.text, // local name (alias if present)
    raw: el.getText(sf),
  }))
}

// Get the imported (original) name of a named import element — for matching against
// the cards-impl exports, we need the symbol that was exported by the module.
// `el.propertyName` is set when there is `as` aliasing; otherwise it's the same as `name`.
const getImportedName = (raw: string): string => {
  // raw is either "Foo" or "Foo as Bar". Extract "Foo".
  const m = /^([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:as\s+[A-Za-z_$][A-Za-z0-9_$]*)?$/.exec(raw.trim())
  return m ? m[1] : raw.trim()
}

export function rewriteImports(input: RewriteInput): RewriteResult {
  const sf = ts.createSourceFile(input.sourcePath, input.sourceText, ts.ScriptTarget.Latest, true)
  const edits: Edit[] = []
  let rewrittenLines = 0

  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    const moduleSpec = (stmt.moduleSpecifier as ts.StringLiteral).text
    const m = CARDS_PATH_RE.exec(moduleSpec)
    if (!m) continue

    const clause = stmt.importClause
    if (!clause) continue
    const named = parseNamedBindings(clause, sf)
    if (!named || named.length === 0) continue

    // Skip if there is a default import or namespace — out of scope per task.
    if (clause.name) continue
    if (clause.namedBindings && !ts.isNamedImports(clause.namedBindings)) continue

    // Classify named bindings
    const displayBindings: NamedBindingRaw[] = []
    const restBindings: NamedBindingRaw[] = []
    for (const b of named) {
      const importedName = getImportedName(b.raw)
      if (CARD_IMPL_BINDING_RE.test(importedName)) {
        restBindings.push(b)
      } else if (CARD_BINDING_RE.test(importedName)) {
        displayBindings.push(b)
      } else {
        restBindings.push(b)
      }
    }

    if (displayBindings.length === 0) continue // nothing to redirect

    const prefix = m[1]
    const deck = m[2]
    const file = m[3]
    const displayPath = `${prefix}shared/cards-display/${deck}/${file}`
    const cardsPath = moduleSpec // unchanged

    // Reconstruct the full statement text replacement.
    const typeMarker = clause.isTypeOnly ? 'type ' : ''
    const lines: string[] = []
    lines.push(
      `import ${typeMarker}{ ${displayBindings.map((b) => b.raw).join(', ')} } from '${displayPath}'`,
    )
    if (restBindings.length > 0) {
      lines.push(
        `import ${typeMarker}{ ${restBindings.map((b) => b.raw).join(', ')} } from '${cardsPath}'`,
      )
    }

    // Preserve trailing semicolon if the original had one.
    const start = stmt.getStart(sf)
    const end = stmt.getEnd()
    const originalText = input.sourceText.slice(start, end)
    const hadSemicolon = originalText.trimEnd().endsWith(';')
    const replacement = lines.map((l) => (hadSemicolon ? `${l};` : l)).join('\n')
    edits.push({ start, end, replacement })
    rewrittenLines++
  }

  if (edits.length === 0) return { text: input.sourceText, changed: false, rewrittenLines: 0 }

  // Apply edits in reverse order to keep offsets stable.
  edits.sort((a, b) => b.start - a.start)
  let text = input.sourceText
  for (const e of edits) {
    text = text.slice(0, e.start) + e.replacement + text.slice(e.end)
  }
  return { text, changed: true, rewrittenLines }
}

// ----------------- CLI driver -----------------

const SCAN_ROOTS = ['server', 'shared', 'client', 'src', 'tests', 'scripts', 'e2e-tests']
const SKIP_FILE_RE = /\/shared\/cards\/[A-E]\/[A-Z]\d+_/
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'output'])

interface RunOptions {
  rootDir: string
  dryRun: boolean
}

interface RunReport {
  scanned: number
  modified: number
  totalRewrittenLines: number
  modifiedFiles: string[]
}

const collectTsFiles = (dir: string, out: string[]): void => {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      collectTsFiles(full, out)
    } else if (st.isFile() && name.endsWith('.ts') && !name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
}

export function runCodemod(opts: RunOptions): RunReport {
  const report: RunReport = { scanned: 0, modified: 0, totalRewrittenLines: 0, modifiedFiles: [] }
  const files: string[] = []
  for (const root of SCAN_ROOTS) {
    collectTsFiles(resolve(opts.rootDir, root), files)
  }
  for (const f of files) {
    const rel = relative(opts.rootDir, f).replace(/\\/g, '/')
    if (SKIP_FILE_RE.test(`/${rel}`)) continue
    report.scanned++
    const sourceText = readFileSync(f, 'utf8')
    const result = rewriteImports({ sourcePath: rel, sourceText })
    if (!result.changed) continue
    report.modified++
    report.totalRewrittenLines += result.rewrittenLines
    report.modifiedFiles.push(rel)
    if (!opts.dryRun) writeFileSync(f, result.text)
  }
  return report
}

const __filename_local = fileURLToPath(import.meta.url)
const __dirname_local = dirname(__filename_local)

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename_local)) {
  const dryRun = !process.argv.includes('--wet-run')
  const report = runCodemod({ dryRun, rootDir: resolve(__dirname_local, '..') })
  console.log(`Codemod ${dryRun ? '(dry-run)' : '(WET)'}:`)
  console.log(`  Files scanned:        ${report.scanned}`)
  console.log(`  Files modified:       ${report.modified}`)
  console.log(`  Import lines rewrote: ${report.totalRewrittenLines}`)
  if (report.modifiedFiles.length > 0) {
    console.log('\nModified files:')
    for (const f of report.modifiedFiles) console.log(`  ${f}`)
  }
}
