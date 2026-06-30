#!/usr/bin/env tsx
/**
 * Build cards manifest for lazy loading.
 *
 * Scans shared/cards/{A,B,C,D,E,M,major,community}/*.ts plus dev/test stubs in
 * shared/cards/__stubs__/*.ts and extracts meta fields from Card Source files.
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
  playerActionCardType?: 'minor' | 'occupation'
  category?: string
  desc?: string[]
  cost?: Record<string, number>
  altCosts?: Record<string, number>[]
  exchanges?: Array<{
    from: Record<string, number>
    to: Record<string, number>
    max?: number
    triggers?: string[]
  }>
  players?: string
  prerequisite?: unknown
  maxRound?: number
  vp?: number
  isCookery?: boolean
  isBaking?: boolean
  passing?: boolean
  returnCards?: string[]
  occupationPrerequisites?: unknown
  improvementPrerequisites?: unknown
  implemented?: boolean
  evenMoreSet?: boolean
  extraVp?: boolean
  providesField?: boolean
  providesOccupation?: boolean
  isField?: boolean
  fireplaceIdentity?: boolean
  cookingHearthIdentity?: boolean
  ovenIdentity?: boolean
  firewoodBuildTrigger?: boolean
  potteryIdentity?: boolean
  preventsHandDiscard?: boolean
  animalHolder?: boolean
  blocksHouseAnimalZones?: boolean
  waresSalesmanGains?: unknown
  mustBePlayedViaMinorAction?: boolean
  requiresFarmersOfTheMoor?: boolean
  heatingRoomDiscount?: number
  heatingFuelCap?: number
  heatingWoodToFuelDiscount?: number
  moorSpecialActionBonuses?: unknown
  mustBePlayedViaMajorImprovementAction?: boolean
  alsoCountsAs?: string[]
  cardField?: unknown
  enablesPalisades?: boolean
  locales?: Record<string, { name: string; desc: string[]; prerequisite?: string }>
}

export type CardManifestEntry = {
  meta: CardMeta
  module: string
  reaches: string[]
}

export type CardsManifest = Record<string, CardManifestEntry>

const META_FIELDS = new Set([
  'id', 'name', 'deck', 'number', 'playerActionCardType', 'category', 'desc',
  'cost', 'altCosts', 'exchanges', 'players', 'prerequisite', 'vp',
  'maxRound', 'isCookery', 'isBaking', 'passing', 'returnCards',
  'occupationPrerequisites', 'improvementPrerequisites', 'implemented',
  'evenMoreSet', 'extraVp', 'providesField', 'providesOccupation', 'isField',
  'fireplaceIdentity', 'cookingHearthIdentity', 'ovenIdentity', 'firewoodBuildTrigger', 'potteryIdentity',
  'preventsHandDiscard', 'animalHolder', 'blocksHouseAnimalZones',
  'waresSalesmanGains', 'mustBePlayedViaMinorAction',
  'requiresFarmersOfTheMoor', 'heatingRoomDiscount', 'heatingFuelCap',
  'heatingWoodToFuelDiscount',
  'moorSpecialActionBonuses',
  'mustBePlayedViaMajorImprovementAction', 'alsoCountsAs', 'cardField',
  'enablesPalisades', 'locales',
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

const CARD_SOURCE_FACTORY_TO_TYPE: Record<string, CardMeta['type']> = {
  defineOccupationCard: 'occupation',
  defineMinorCard: 'minor',
  defineMajorCard: 'major',
  definePlayerActionCard: 'playerAction',
}

function propertyNameText(name: ts.PropertyName): string {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
    ? name.text
    : name.getText().replace(/["']/g, '')
}

function collectModuleConstInitializers(sf: ts.SourceFile): Map<string, ts.Expression> {
  const constants = new Map<string, ts.Expression>()
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    if (!(stmt.declarationList.flags & ts.NodeFlags.Const)) continue
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.initializer) {
        constants.set(decl.name.text, decl.initializer)
      }
    }
  }
  return constants
}

function extractStaticJsonLikeValue(
  expr: ts.Expression,
  constants: Map<string, ts.Expression>,
  context: string,
  seen = new Set<string>(),
): unknown {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text
  if (ts.isNumericLiteral(expr)) return Number(expr.text)
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expr.operand)
  ) {
    return -Number(expr.operand.text)
  }
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expr.operand)
  ) {
    return -Number(expr.operand.text)
  }
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return true
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return false
  if (expr.kind === ts.SyntaxKind.NullKeyword) return null
  if (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isTypeAssertionExpression(expr) ||
    ts.isSatisfiesExpression(expr)
  ) {
    return extractStaticJsonLikeValue(expr.expression, constants, context, seen)
  }
  if (ts.isIdentifier(expr)) {
    const initializer = constants.get(expr.text)
    if (!initializer) {
      throw new Error(`${context}: unresolved identifier ${expr.text}`)
    }
    if (seen.has(expr.text)) {
      throw new Error(`${context}: circular identifier ${expr.text}`)
    }
    const nextSeen = new Set(seen)
    nextSeen.add(expr.text)
    return extractStaticJsonLikeValue(initializer, constants, context, nextSeen)
  }
  if (ts.isArrayLiteralExpression(expr)) {
    return expr.elements.map((el, index) => {
      if (ts.isSpreadElement(el)) {
        throw new Error(`${context}[${index}]: spread is not statically supported`)
      }
      return extractStaticJsonLikeValue(el, constants, `${context}[${index}]`, seen)
    })
  }
  if (ts.isObjectLiteralExpression(expr)) {
    const obj: Record<string, unknown> = {}
    for (const prop of expr.properties) {
      if (ts.isSpreadAssignment(prop)) {
        const spread = extractStaticJsonLikeValue(prop.expression, constants, `${context}.<spread>`, seen)
        if (!spread || typeof spread !== 'object' || Array.isArray(spread)) {
          throw new Error(`${context}: spread must resolve to an object literal`)
        }
        Object.assign(obj, spread)
        continue
      }
      if (!ts.isPropertyAssignment(prop)) {
        throw new Error(`${context}: only property assignments are statically supported`)
      }
      const key = propertyNameText(prop.name)
      obj[key] = extractStaticJsonLikeValue(prop.initializer, constants, `${context}.${key}`, seen)
    }
    return obj
  }
  throw new Error(`${context}: expression is not statically JSON-like`)
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

/** Parse all `export const <name>: MajorCardData = {...}` literal vars. */
function parseMajorCardDataVars(
  sf: ts.SourceFile,
): Array<{ varName: string; obj: Record<string, unknown> }> {
  // Pass 1: collect every typed `MajorCardData` variable's literal object (with spread placeholders).
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
      // Accept legacy major literal shapes for manifest fixtures.
      if (typeText !== 'MajorCardData' && typeText !== 'MajorCardDisplay') continue
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

/** Parse MajorCardData literal into a CardMeta. */
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

type ParseCardFileOptions = {
  includeLegacyConstructors?: boolean
  includeMajorLiterals?: boolean
  includeCardSources?: boolean
}

function cardSourceCallToMeta(
  filePath: string,
  call: ts.CallExpression,
  constants: Map<string, ts.Expression>,
): CardMeta | null {
  if (!ts.isIdentifier(call.expression)) return null
  const type = CARD_SOURCE_FACTORY_TO_TYPE[call.expression.text]
  if (!type) return null
  const arg = call.arguments[0]
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    throw new Error(`${filePath}: Card Source input must be an object literal`)
  }
  const metaProp = arg.properties.find(
    (prop): prop is ts.PropertyAssignment =>
      ts.isPropertyAssignment(prop) && propertyNameText(prop.name) === 'meta',
  )
  if (!metaProp) {
    throw new Error(`${filePath}: Card Source meta must be present`)
  }

  const rawMeta = extractStaticJsonLikeValue(
    metaProp.initializer,
    constants,
    `${filePath}: meta`,
  )
  if (!rawMeta || typeof rawMeta !== 'object' || Array.isArray(rawMeta)) {
    throw new Error(`${filePath}: Card Source meta must resolve to an object literal`)
  }

  const meta: Record<string, unknown> = {}
  for (const [keyName, value] of Object.entries(rawMeta)) {
    if (META_FIELDS.has(keyName)) meta[keyName] = value
  }
  if (typeof meta.id !== 'string') {
    throw new Error(`${filePath}: Card Source meta.id must be a static string`)
  }
  if (
    type === 'playerAction' &&
    meta.playerActionCardType !== 'minor' &&
    meta.playerActionCardType !== 'occupation'
  ) {
    throw new Error(`${filePath}: definePlayerActionCard meta.playerActionCardType must be 'minor' or 'occupation'`)
  }
  meta.type = type
  return meta as unknown as CardMeta
}

export function parseCardFile(filePath: string, options: ParseCardFileOptions = {}): ParsedCardFile {
  const includeLegacyConstructors = options.includeLegacyConstructors ?? true
  const includeMajorLiterals = options.includeMajorLiterals ?? true
  const includeCardSources = options.includeCardSources ?? true
  const source = fs.readFileSync(filePath, 'utf8')
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  // Pass 1: collect module-level string/number constants so we can resolve CARD_ID-style refs.
  const constants = new Map<string, unknown>()
  const constInitializers = collectModuleConstInitializers(sf)
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
    if (includeCardSources && ts.isCallExpression(node)) {
      const sourceMeta = cardSourceCallToMeta(filePath, node, constInitializers)
      if (sourceMeta) metas.push(sourceMeta)
    }
    if (
      includeLegacyConstructors &&
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

  // Pattern B: `export const x: MajorCardData = {...}`
  if (includeMajorLiterals) {
    const majorEffects = parseMajorCardDataVars(sf)
    for (const { obj } of majorEffects) {
      const meta = majorEffectObjectToMeta(obj)
      if (!meta) continue
      // Skip if we already captured this id via Pattern A (unlikely but defensive).
      if (metas.some((m) => m.id === meta.id)) continue
      metas.push(meta)
    }
  }

  return { metas }
}

export function buildCardsManifest(cardsRoot: string): CardsManifest {
  const manifest: CardsManifest = {}
  const decks = ['A', 'B', 'C', 'D', 'E', 'M', 'major', 'community']
  const repoRoot = path.resolve(cardsRoot, '..', '..')
  const scanDir = (deckDir: string, parseOptions?: ParseCardFileOptions) => {
    if (!fs.existsSync(deckDir)) return
    const files = fs.readdirSync(deckDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    for (const file of files) {
      const filePath = path.join(deckDir, file)
      const { metas } = parseCardFile(filePath, parseOptions)
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
  for (const deck of decks) {
    scanDir(path.join(repoRoot, 'shared', 'cards', deck), {
      includeLegacyConstructors: false,
      includeMajorLiterals: false,
      includeCardSources: true,
    })
  }
  for (const deck of decks) {
    scanDir(path.join(cardsRoot, deck))
  }
  scanDir(path.join(repoRoot, 'shared', 'cards', '__stubs__'))
  return manifest
}

export function writeCardsManifest(repoRoot: string): string {
  const cardsRoot = path.join(repoRoot, 'shared', 'cards')
  const outputPath = path.join(repoRoot, 'public', 'cards-manifest.json')
  const manifest = buildCardsManifest(cardsRoot)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  return outputPath
}

if (process.argv[1] && process.argv[1].endsWith('build-cards-manifest.ts')) {
  const repoRoot = path.resolve(__dirname, '..')
  const outputPath = writeCardsManifest(repoRoot)
  const manifest = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as CardsManifest
  console.log(`[build-cards-manifest] wrote ${Object.keys(manifest).length} cards to ${outputPath}`)
}
