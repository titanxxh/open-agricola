#!/usr/bin/env tsx
/**
 * Build cards manifest for lazy loading.
 *
 * Scans shared/cards/{A,B,C,D,E,major}/*.ts and extracts meta fields
 * from each card's constructor call (Occupation / MinorImprovement / MajorImprovement).
 *
 * Output: public/cards-manifest.json
 */
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export type CardMeta = {
  id: string
  name: string
  deck: string
  number: number
  category?: string
  desc?: string[]
  cost?: Record<string, number>
  players?: string
  newSet?: boolean
  prerequisite?: unknown
}

export type CardManifestEntry = {
  meta: CardMeta
  module: string
  reaches: string[]
}

export type CardsManifest = Record<string, CardManifestEntry>

const META_FIELDS = new Set([
  'id', 'name', 'deck', 'number', 'category', 'desc',
  'cost', 'players', 'newSet', 'prerequisite',
])

const CARD_CLASSES = new Set(['Occupation', 'MinorImprovement', 'MajorImprovement'])

function extractValueFromExpr(expr: ts.Expression): unknown {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text
  if (ts.isNumericLiteral(expr)) return Number(expr.text)
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return true
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return false
  if (expr.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isArrayLiteralExpression(expr)) {
    return expr.elements.map((el) => extractValueFromExpr(el))
  }
  if (ts.isObjectLiteralExpression(expr)) {
    const obj: Record<string, unknown> = {}
    for (const prop of expr.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      const key = prop.name.getText()
      obj[key.replace(/["']/g, '')] = extractValueFromExpr(prop.initializer)
    }
    return obj
  }
  if (ts.isIdentifier(expr)) return { __identifier: expr.text }
  return undefined
}

function parseCardFile(filePath: string, constants: Map<string, unknown>): CardMeta | null {
  const source = fs.readFileSync(filePath, 'utf8')
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  for (const stmt of sf.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          const val = extractValueFromExpr(decl.initializer)
          if (typeof val === 'string' || typeof val === 'number') {
            constants.set(decl.name.text, val)
          }
        }
      }
    }
  }

  let result: CardMeta | null = null
  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && CARD_CLASSES.has(node.expression.text)) {
      const arg = node.arguments?.[0]
      if (arg && ts.isObjectLiteralExpression(arg)) {
        const meta: Record<string, unknown> = {}
        for (const prop of arg.properties) {
          if (!ts.isPropertyAssignment(prop)) continue
          const keyName = ts.isIdentifier(prop.name) ? prop.name.text
            : ts.isStringLiteral(prop.name) ? prop.name.text
            : prop.name.getText().replace(/["']/g, '')
          if (!META_FIELDS.has(keyName)) continue
          let value = extractValueFromExpr(prop.initializer)
          if (value && typeof value === 'object' && '__identifier' in value) {
            const resolved = constants.get((value as { __identifier: string }).__identifier)
            value = resolved !== undefined ? resolved : null
          }
          meta[keyName] = value
        }
        result = meta as unknown as CardMeta
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return result
}

export function buildCardsManifest(cardsRoot: string): CardsManifest {
  const manifest: CardsManifest = {}
  const decks = ['A', 'B', 'C', 'D', 'E', 'major']
  for (const deck of decks) {
    const deckDir = path.join(cardsRoot, deck)
    if (!fs.existsSync(deckDir)) continue
    const files = fs.readdirSync(deckDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    for (const file of files) {
      const filePath = path.join(deckDir, file)
      const constants = new Map<string, unknown>()
      const meta = parseCardFile(filePath, constants)
      if (!meta || !meta.id) continue
      const modulePath = path.relative(
        path.resolve(cardsRoot, '..', '..'),
        filePath.replace(/\.ts$/, ''),
      )
      manifest[meta.id] = {
        meta,
        module: modulePath,
        reaches: [],
      }
    }
  }
  return manifest
}

if (process.argv[1] && process.argv[1].endsWith('build-cards-manifest.ts')) {
  const repoRoot = path.resolve(__dirname, '..')
  const cardsRoot = path.join(repoRoot, 'shared', 'cards')
  const outputPath = path.join(repoRoot, 'public', 'cards-manifest.json')
  const manifest = buildCardsManifest(cardsRoot)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  console.log(`[build-cards-manifest] wrote ${Object.keys(manifest).length} cards to ${outputPath}`)
}
