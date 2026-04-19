#!/usr/bin/env tsx
/**
 * CI guard: each card's _impl.reaches must declare all external card IDs
 * referenced from its handler bodies.
 *
 * PR-1: warn-only (no cards have _impl yet).
 * PR-2: flipped to strict.
 */
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const CARD_ID_PATTERN = /^[A-E]\d+_[A-Z]\w*$/
const DECK_PATTERN = /^[A-E]:(all|\d+-\d+)$/

export type ReachViolation = {
  file: string
  cardId: string
  missingReach: string
  location: string
}

export type CheckReachesResult = {
  violations: ReachViolation[]
  cardsChecked: number
}

function extractStringLiterals(node: ts.Node): string[] {
  const out: string[] = []
  const visit = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text)
    ts.forEachChild(n, visit)
  }
  visit(node)
  return out
}

function findImplExport(sf: ts.SourceFile): { cardId: string; implNode: ts.Node; reaches: string[] } | null {
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt) || !stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue
      const name = decl.name.text
      const implMatch = name.match(/^([A-E]\d+_\w+)_impl$/)
      if (!implMatch) continue
      const cardId = implMatch[1]
      if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) continue
      const reaches: string[] = []
      for (const prop of decl.initializer.properties) {
        if (!ts.isPropertyAssignment(prop)) continue
        const key = ts.isIdentifier(prop.name) ? prop.name.text : prop.name.getText()
        if (key === 'reaches' && ts.isArrayLiteralExpression(prop.initializer)) {
          for (const el of prop.initializer.elements) {
            if (ts.isStringLiteral(el)) reaches.push(el.text)
          }
        }
      }
      return { cardId, implNode: decl.initializer, reaches }
    }
  }
  return null
}

export function checkReaches(files: string[]): CheckReachesResult {
  const violations: ReachViolation[] = []
  let cardsChecked = 0
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const implInfo = findImplExport(sf)
    if (!implInfo) continue
    cardsChecked += 1
    const { cardId, implNode, reaches } = implInfo
    const literals = extractStringLiterals(implNode)
    const allowedIds = new Set<string>([cardId, ...reaches.filter((r) => !DECK_PATTERN.test(r))])
    for (const literal of literals) {
      if (CARD_ID_PATTERN.test(literal) && !allowedIds.has(literal)) {
        if (reaches.some((r) => DECK_PATTERN.test(r))) continue
        violations.push({
          file,
          cardId,
          missingReach: literal,
          location: `line in ${path.basename(file)}`,
        })
      }
    }
  }
  return { violations, cardsChecked }
}

function walkCardFiles(cardsRoot: string): string[] {
  const out: string[] = []
  if (!fs.existsSync(cardsRoot)) return out
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === '__stubs__') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full)
    }
  }
  walk(cardsRoot)
  return out
}

if (process.argv[1] && process.argv[1].endsWith('check-reaches.ts')) {
  const repoRoot = path.resolve(__dirname, '..')
  const strict = process.argv.includes('--strict')
  const cardsRoot = path.join(repoRoot, 'shared', 'cards')
  const files = walkCardFiles(cardsRoot)
  const { violations, cardsChecked } = checkReaches(files)
  if (cardsChecked === 0) {
    console.log('[check-reaches] 0 cards with _impl export (PR-1 state — cards not yet restructured)')
    process.exit(0)
  }
  console.log(`[check-reaches] checked ${cardsChecked} cards`)
  if (violations.length === 0) {
    console.log('[check-reaches] ✓ all reaches declarations consistent')
    process.exit(0)
  }
  console.warn(`[check-reaches] ${violations.length} violation(s):`)
  for (const v of violations.slice(0, 20)) {
    console.warn(`  ${path.relative(repoRoot, v.file)}  card=${v.cardId}  missing=${v.missingReach}`)
  }
  if (strict) process.exit(1)
  console.warn('[check-reaches] warn mode (PR-1): not failing build')
  process.exit(0)
}
