// Codemod: split a card file into display + impl halves.
//
// Input:  shared/cards/<deck>/<file>.ts (single file with display + _impl exports)
// Output: shared/cards-display/<deck>/<file>.ts (display const + only display imports)
//         shared/cards/<deck>/<file>.ts (overwritten — _impl + back-import display + only impl imports)

import * as ts from 'typescript'

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
  }
}

const renderImport = (info: ImportInfo, refs: Set<string>): string | null => {
  const defaultName = info.defaultName && refs.has(info.defaultName) ? info.defaultName : null
  const namedKept = info.named.filter((n) => refs.has(n.name))
  if (!defaultName && namedKept.length === 0) return null
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

  const stmtText = (stmt: ts.Statement): string => stmt.getText(sf)

  const displayStmts: ts.Statement[] = []
  const implStmts: ts.Statement[] = []
  for (const entry of otherStatements) {
    if (entry.kind === 'display') displayStmts.push(entry.node)
    else if (entry.kind === 'impl') implStmts.push(entry.node)
    else displayStmts.push(entry.node)
  }

  const displayRefs = new Set<string>()
  for (const s of displayStmts) for (const id of collectIdentifiers(s)) displayRefs.add(id)
  const implRefs = new Set<string>()
  for (const s of implStmts) for (const id of collectIdentifiers(s)) implRefs.add(id)

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
