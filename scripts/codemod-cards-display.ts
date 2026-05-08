// Codemod: split a card file into display + impl halves.
//
// Input:  shared/cards/<deck>/<file>.ts (single file with display + _impl exports)
// Output: shared/cards-display/<deck>/<file>.ts (display const + only display imports)
//         shared/cards/<deck>/<file>.ts (overwritten — _impl + back-import display + only impl imports)

import * as ts from 'typescript'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { dirname, join, resolve, relative } from 'path'
import { fileURLToPath } from 'url'

export type SplitResult =
  | { kind: 'split'; displayText: string; implText: string }
  | { kind: 'display-only'; displayText: string }
  | { kind: 'skip'; reason: string }

export interface SplitInput {
  sourcePath: string
  sourceText: string
}

const DISPLAY_CTORS = new Set(['MinorImprovement', 'Occupation', 'PlayerActionCard'])

interface ImportInfo {
  node: ts.ImportDeclaration
  moduleSpec: string
  isTypeOnly: boolean
  defaultName: string | null
  named: { name: string; isTypeOnly: boolean; raw: string }[]
  originalText: string
}

const collectIdentifiers = (node: ts.Node): Set<string> => {
  const ids = new Set<string>()
  const walk = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) ids.add(n.text)
    ts.forEachChild(n, walk)
  }
  walk(node)
  return ids
}

const parseImport = (imp: ts.ImportDeclaration, sf: ts.SourceFile): ImportInfo | null => {
  const clause = imp.importClause
  if (!clause) return null
  const moduleSpec = (imp.moduleSpecifier as ts.StringLiteral).text
  const defaultName = clause.name ? clause.name.text : null
  const named: { name: string; isTypeOnly: boolean; raw: string }[] = []
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    for (const el of clause.namedBindings.elements) {
      named.push({
        name: el.name.text,
        isTypeOnly: el.isTypeOnly,
        raw: el.getText(sf),
      })
    }
  }
  return {
    node: imp,
    moduleSpec,
    isTypeOnly: clause.isTypeOnly,
    defaultName,
    named,
    originalText: imp.getText(sf),
  }
}

const renderImport = (info: ImportInfo, refs: Set<string>): string | null => {
  const defaultName = info.defaultName && refs.has(info.defaultName) ? info.defaultName : null
  const namedKept = info.named.filter((n) => refs.has(n.name))
  if (!defaultName && namedKept.length === 0) return null

  // If everything is kept, preserve original formatting (incl. multi-line layout).
  const allDefaultKept = info.defaultName === null || defaultName !== null
  const allNamedKept = namedKept.length === info.named.length
  if (allDefaultKept && allNamedKept) {
    return info.originalText.replace(/;$/, '')
  }

  const typeMarker = info.isTypeOnly ? 'type ' : ''
  const parts: string[] = []
  if (defaultName) parts.push(defaultName)
  if (namedKept.length > 0) {
    parts.push(`{ ${namedKept.map((n) => n.raw).join(', ')} }`)
  }
  return `import ${typeMarker}${parts.join(', ')} from '${info.moduleSpec}'`
}

export function splitCardFile(input: SplitInput): SplitResult {
  const sf = ts.createSourceFile(
    input.sourcePath,
    input.sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )

  const imports: ImportInfo[] = []
  type Entry = { node: ts.Statement; kind: 'display' | 'impl' | 'shared' }
  const otherStatements: Entry[] = []
  let displayName: string | null = null
  const implNames: string[] = []

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const info = parseImport(stmt, sf)
      if (info) imports.push(info)
      continue
    }
    if (ts.isVariableStatement(stmt)) {
      const decl = stmt.declarationList.declarations[0]
      if (decl && ts.isIdentifier(decl.name)) {
        const name = decl.name.text
        if (decl.initializer && ts.isNewExpression(decl.initializer) &&
            ts.isIdentifier(decl.initializer.expression) &&
            DISPLAY_CTORS.has(decl.initializer.expression.text)) {
          displayName = name
          otherStatements.push({ node: stmt, kind: 'display' })
          continue
        }
        if (name.endsWith('_impl')) {
          implNames.push(name)
          otherStatements.push({ node: stmt, kind: 'impl' })
          continue
        }
        otherStatements.push({ node: stmt, kind: 'shared' })
        continue
      }
    }
    otherStatements.push({ node: stmt, kind: 'shared' })
  }

  if (!displayName) return { kind: 'skip', reason: 'no display export found' }

  const fullText = sf.getFullText()
  const stmtText = (stmt: ts.Statement): string => {
    const ranges = ts.getLeadingCommentRanges(fullText, stmt.getFullStart()) ?? []
    // Only attach JSDoc-style block comments (/** ... */) — line comments are
    // typically attached to imports above and would be duplicated.
    const jsDocRanges = ranges.filter((r) => {
      const t = fullText.slice(r.pos, r.end)
      return t.startsWith('/**')
    })
    if (jsDocRanges.length === 0) return stmt.getText(sf)
    const first = jsDocRanges[0]
    const prefix = fullText.slice(first.pos, stmt.getStart(sf))
    return prefix + stmt.getText(sf)
  }

  // First pass: collect what display + impl statements reference.
  const displayOwnStmts: ts.Statement[] = []
  const implOwnStmts: ts.Statement[] = []
  const sharedStmts: ts.Statement[] = []
  for (const entry of otherStatements) {
    if (entry.kind === 'display') displayOwnStmts.push(entry.node)
    else if (entry.kind === 'impl') implOwnStmts.push(entry.node)
    else sharedStmts.push(entry.node)
  }

  const namesDeclaredBy = (stmt: ts.Statement): string[] => {
    const names: string[] = []
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.push(decl.name.text)
      }
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      names.push(stmt.name.text)
    }
    return names
  }

  // Iteratively classify shared stmts by what side references them (transitively).
  const displayRefs = new Set<string>()
  for (const s of displayOwnStmts) for (const id of collectIdentifiers(s)) displayRefs.add(id)
  const implRefs = new Set<string>()
  for (const s of implOwnStmts) for (const id of collectIdentifiers(s)) implRefs.add(id)

  type Classification = 'display' | 'impl' | 'orphan'
  const sharedClass = new Map<ts.Statement, Classification>()
  let changed = true
  while (changed) {
    changed = false
    for (const s of sharedStmts) {
      if (sharedClass.has(s)) continue
      const names = namesDeclaredBy(s)
      const wantedByDisplay = names.some((n) => displayRefs.has(n))
      const wantedByImpl = names.some((n) => implRefs.has(n))
      if (wantedByDisplay) {
        sharedClass.set(s, 'display')
        for (const id of collectIdentifiers(s)) displayRefs.add(id)
        changed = true
      } else if (wantedByImpl) {
        sharedClass.set(s, 'impl')
        for (const id of collectIdentifiers(s)) implRefs.add(id)
        changed = true
      }
    }
  }
  // Statements not referenced by either side (e.g. top-level expression statements
  // like `registerAdHocAction(...)`) — default to impl.
  for (const s of sharedStmts) {
    if (!sharedClass.has(s)) {
      sharedClass.set(s, 'impl')
      for (const id of collectIdentifiers(s)) implRefs.add(id)
    }
  }

  // Walk original statement order, splitting into display/impl streams.
  const displayStmts: ts.Statement[] = []
  const implStmts: ts.Statement[] = []
  for (const entry of otherStatements) {
    if (entry.kind === 'display') displayStmts.push(entry.node)
    else if (entry.kind === 'impl') implStmts.push(entry.node)
    else {
      const cls = sharedClass.get(entry.node)
      if (cls === 'display') displayStmts.push(entry.node)
      else implStmts.push(entry.node)
    }
  }

  const renderImports = (refs: Set<string>): string[] => {
    const out: string[] = []
    for (const imp of imports) {
      const line = renderImport(imp, refs)
      if (line !== null) out.push(line)
    }
    return out
  }

  const displayImports = renderImports(displayRefs)

  const displayLines: string[] = []
  displayLines.push(...displayImports)
  if (displayImports.length > 0) displayLines.push('')
  for (let i = 0; i < displayStmts.length; i++) {
    if (i > 0) displayLines.push('')
    displayLines.push(stmtText(displayStmts[i]))
  }
  const displayText = displayLines.join('\n').replace(/\n+$/, '') + '\n'

  if (implNames.length === 0) return { kind: 'display-only', displayText }

  const implImports = renderImports(implRefs)
  const segments = input.sourcePath.split('/')
  const deck = segments[segments.length - 2]
  const filename = segments[segments.length - 1].replace(/\.ts$/, '')
  const backImportPath = `../../cards-display/${deck}/${filename}`

  let cardIdConstName: string | null = null
  for (const s of displayStmts) {
    if (ts.isVariableStatement(s)) {
      const decl = s.declarationList.declarations[0]
      if (decl && ts.isIdentifier(decl.name) && decl.initializer && ts.isStringLiteral(decl.initializer)) {
        cardIdConstName = decl.name.text
        break
      }
    }
  }

  const implLines: string[] = []
  implLines.push(...implImports)
  implLines.push(`import { ${displayName} } from '${backImportPath}'`)
  implLines.push('')
  if (cardIdConstName && implRefs.has(cardIdConstName)) {
    implLines.push(`const ${cardIdConstName} = ${displayName}.id`)
    implLines.push('')
  }
  for (let i = 0; i < implStmts.length; i++) {
    if (i > 0) implLines.push('')
    implLines.push(stmtText(implStmts[i]))
  }
  const implText = implLines.join('\n').replace(/\n+$/, '') + '\n'

  return { kind: 'split', displayText, implText }
}

interface RunOptions { dryRun: boolean; rootDir: string }
interface RunReport {
  totalCardFiles: number
  splitCount: number
  displayOnlyCount: number
  skipCount: number
  errors: { path: string; reason: string }[]
}

const DECKS = ['A', 'B', 'C', 'D', 'E', 'major', 'community', '__stubs__']

export function runCodemod(opts: RunOptions): RunReport {
  const cardsRoot = resolve(opts.rootDir, 'shared/cards')
  const displayRoot = resolve(opts.rootDir, 'shared/cards-display')
  const report: RunReport = {
    totalCardFiles: 0, splitCount: 0, displayOnlyCount: 0, skipCount: 0, errors: [],
  }
  for (const deck of DECKS) {
    const deckPath = join(cardsRoot, deck)
    let files: string[]
    try { files = readdirSync(deckPath) } catch { continue }
    for (const file of files) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue
      const fullPath = join(deckPath, file)
      if (!statSync(fullPath).isFile()) continue
      report.totalCardFiles++
      const sourceText = readFileSync(fullPath, 'utf8')
      const sourcePath = relative(opts.rootDir, fullPath).replace(/\\/g, '/')
      try {
        const result = splitCardFile({ sourcePath, sourceText })
        if (result.kind === 'skip') {
          report.skipCount++
          report.errors.push({ path: sourcePath, reason: result.reason })
          continue
        }
        if (result.kind === 'display-only') {
          report.displayOnlyCount++
          if (!opts.dryRun) {
            const target = join(displayRoot, deck, file)
            mkdirSync(dirname(target), { recursive: true })
            writeFileSync(target, result.displayText)
          }
          continue
        }
        report.splitCount++
        if (!opts.dryRun) {
          const target = join(displayRoot, deck, file)
          mkdirSync(dirname(target), { recursive: true })
          writeFileSync(target, result.displayText)
          writeFileSync(fullPath, result.implText)
        }
      } catch (e) {
        report.errors.push({ path: sourcePath, reason: (e as Error).message })
      }
    }
  }
  return report
}

const __filename_local = fileURLToPath(import.meta.url)
const __dirname_local = dirname(__filename_local)

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename_local)) {
  const dryRun = !process.argv.includes('--write')
  const report = runCodemod({ dryRun, rootDir: resolve(__dirname_local, '..') })
  console.log(`Codemod ${dryRun ? '(dry-run)' : '(WET)'}:`)
  console.log(`  Total card files: ${report.totalCardFiles}`)
  console.log(`  Split:            ${report.splitCount}`)
  console.log(`  Display-only:     ${report.displayOnlyCount}`)
  console.log(`  Skip + errors:    ${report.skipCount + report.errors.length}`)
  if (report.errors.length > 0) {
    console.log('\nErrors:')
    for (const e of report.errors) console.log(`  ${e.path}: ${e.reason}`)
  }
  process.exit(report.errors.length > 0 ? 1 : 0)
}
