#!/usr/bin/env tsx
/**
 * Build cards manifest for lazy loading.
 *
 * Scans shared/cards/{A,B,C,D,E,major}/*.ts and extracts meta fields
 * from each card's constructor call (Occupation / MinorImprovement /
 * MajorImprovement / PlayerActionCard) and from major-literal exports
 * (`export const x: MajorCardEffect = {...}`).
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
  /** Construction type: which card class/literal produced this entry. */
  type: 'occupation' | 'minor' | 'major' | 'playerAction'
  category?: string
  desc?: string[]
  cost?: Record<string, number>
  altCosts?: Record<string, number>[]
  players?: string
  newSet?: boolean
  prerequisite?: unknown
  vp?: number
  isCookery?: boolean
  isBaking?: boolean
  passing?: boolean
  returnCards?: string[]
  alsoCountsAs?: string[]
}

export type CardManifestEntry = {
  meta: CardMeta
  module: string
  reaches: string[]
}

export type CardsManifest = Record<string, CardManifestEntry>

const META_FIELDS = new Set([
  'id', 'name', 'deck', 'number', 'category', 'desc',
  'cost', 'altCosts', 'players', 'newSet', 'prerequisite', 'vp',
  'isCookery', 'isBaking', 'passing', 'returnCards', 'alsoCountsAs',
])

const CARD_CLASSES = new Set([
  'Occupation',
  'MinorImprovement',
  'MajorImprovement',
  'PlayerActionCard',
])

const CARD_CLASS_TO_TYPE: Record<string, CardMeta['type']> = {
  Occupation: 'occupation',
  MinorImprovement: 'minor',
  MajorImprovement: 'major',
  PlayerActionCard: 'playerAction',
}

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

function resolveIdentifierRefs(
  value: unknown,
  constants: Map<string, unknown>,
): unknown {
  if (value && typeof value === 'object' && '__identifier' in (value as object)) {
    const name = (value as { __identifier: string }).__identifier
    const resolved = constants.get(name)
    return resolved !== undefined ? resolved : null
  }
  if (Array.isArray(value)) return value.map((v) => resolveIdentifierRefs(v, constants))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveIdentifierRefs(v, constants)
    }
    return out
  }
  return value
}

/** Parse all `export const <name>: MajorCardEffect = {...}` literal vars. */
function parseMajorCardEffectVars(
  sf: ts.SourceFile,
): Array<{ varName: string; obj: Record<string, unknown> }> {
  // Pass 1: collect every typed `MajorCardEffect` variable's literal object (with spread placeholders).
  type Entry = { varName: string; obj: Record<string, unknown>; spreads: string[] }
  const entries: Entry[] = []

  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    const isExported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    if (!isExported) continue
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue
      if (!decl.type) continue
      const typeText = decl.type.getText()
      if (typeText !== 'MajorCardEffect') continue
      if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) continue

      const obj: Record<string, unknown> = {}
      const spreads: string[] = []
      for (const prop of decl.initializer.properties) {
        if (ts.isSpreadAssignment(prop)) {
          if (ts.isIdentifier(prop.expression)) {
            spreads.push(prop.expression.text)
          }
          continue
        }
        if (!ts.isPropertyAssignment(prop)) continue
        const keyName = ts.isIdentifier(prop.name)
          ? prop.name.text
          : ts.isStringLiteral(prop.name)
            ? prop.name.text
            : prop.name.getText().replace(/["']/g, '')
        obj[keyName] = extractValueFromExpr(prop.initializer)
      }
      entries.push({ varName: decl.name.text, obj, spreads })
    }
  }

  // Pass 2: resolve spreads (lookup earlier entries in same file).
  const byName = new Map<string, Entry>()
  const resolved: Array<{ varName: string; obj: Record<string, unknown> }> = []
  for (const entry of entries) {
    const merged: Record<string, unknown> = {}
    for (const spread of entry.spreads) {
      const parent = byName.get(spread)
      if (parent) Object.assign(merged, parent.obj)
    }
    Object.assign(merged, entry.obj)
    byName.set(entry.varName, { ...entry, obj: merged })
    resolved.push({ varName: entry.varName, obj: merged })
  }
  return resolved
}

/** Parse MajorCardEffect literal into a CardMeta. */
function majorEffectObjectToMeta(
  obj: Record<string, unknown>,
): CardMeta | null {
  const id = typeof obj.id === 'string' ? obj.id : null
  if (!id) return null
  // Number: try to extract trailing integer from id (e.g. Major_Fireplace1 -> 1)
  let number = 0
  const m = id.match(/(\d+)$/)
  if (m) number = Number(m[1])

  const meta: CardMeta = {
    id,
    name: typeof obj.name === 'string' ? (obj.name as string) : '',
    deck: 'major',
    number,
    type: 'major',
  }
  if (obj.cost && typeof obj.cost === 'object') {
    meta.cost = obj.cost as Record<string, number>
  }
  if (Array.isArray(obj.description)) {
    meta.desc = obj.description as string[]
  } else if (Array.isArray(obj.desc)) {
    meta.desc = obj.desc as string[]
  }
  if (typeof obj.vp === 'number') meta.vp = obj.vp
  if (typeof obj.isCookery === 'boolean') meta.isCookery = obj.isCookery
  if (typeof obj.isBaking === 'boolean') meta.isBaking = obj.isBaking
  if (Array.isArray(obj.returnCards)) meta.returnCards = obj.returnCards as string[]
  return meta
}

type ParsedCardFile = {
  metas: CardMeta[]
}

export function parseCardFile(filePath: string): ParsedCardFile {
  const source = fs.readFileSync(filePath, 'utf8')
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  // Pass 1: collect module-level string/number constants so we can resolve CARD_ID-style refs.
  const constants = new Map<string, unknown>()
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

  const metas: CardMeta[] = []

  // Pattern A: `new <CardClass>({...})` anywhere in the file.
  const visit = (node: ts.Node): void => {
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      CARD_CLASSES.has(node.expression.text)
    ) {
      const className = node.expression.text
      const arg = node.arguments?.[0]
      if (arg && ts.isObjectLiteralExpression(arg)) {
        const meta: Record<string, unknown> = {}
        for (const prop of arg.properties) {
          if (!ts.isPropertyAssignment(prop)) continue
          const keyName = ts.isIdentifier(prop.name)
            ? prop.name.text
            : ts.isStringLiteral(prop.name)
              ? prop.name.text
              : prop.name.getText().replace(/["']/g, '')
          if (!META_FIELDS.has(keyName)) continue
          let value = extractValueFromExpr(prop.initializer)
          value = resolveIdentifierRefs(value, constants)
          meta[keyName] = value
        }
        if (typeof meta.id === 'string') {
          meta.type = CARD_CLASS_TO_TYPE[className]
          metas.push(meta as unknown as CardMeta)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  // Pattern B: `export const x: MajorCardEffect = {...}`
  const majorEffects = parseMajorCardEffectVars(sf)
  for (const { obj } of majorEffects) {
    const meta = majorEffectObjectToMeta(obj)
    if (!meta) continue
    // Skip if we already captured this id via Pattern A (unlikely but defensive).
    if (metas.some((m) => m.id === meta.id)) continue
    metas.push(meta)
  }

  return { metas }
}

export function buildCardsManifest(cardsRoot: string): CardsManifest {
  const manifest: CardsManifest = {}
  const decks = ['A', 'B', 'C', 'D', 'E', 'major']
  const repoRoot = path.resolve(cardsRoot, '..', '..')
  for (const deck of decks) {
    const deckDir = path.join(cardsRoot, deck)
    if (!fs.existsSync(deckDir)) continue
    const files = fs.readdirSync(deckDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    for (const file of files) {
      const filePath = path.join(deckDir, file)
      const { metas } = parseCardFile(filePath)
      if (metas.length === 0) continue
      const modulePath = path.relative(repoRoot, filePath.replace(/\.ts$/, ''))
      for (const meta of metas) {
        if (!meta.id) continue
        if (manifest[meta.id]) continue // prefer the first definition we encounter
        manifest[meta.id] = {
          meta,
          module: modulePath,
          reaches: [],
        }
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
