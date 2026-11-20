/**
 * Pure code-generation module for workshop → PR integration.
 *
 * Given a workshop card row + upstream file contents, produce the 4-5 files
 * that should be committed to a fork branch:
 *   1. shared/cards/community/{card_id}.ts              — main card file
 *   2. shared/cards/register-all.ts                     — patched from upstream main
 *   3. shared/cards/catalog.generated.ts                — patched from upstream main
 *   4. docs/community_cards.md                          — patched (new row)
 *   5. public/card-art/community/{card_id}.{ext}        — (optional) binary art
 */
import ts from 'typescript'
import { isNativeCardSource, LEGACY_CARD_SOURCE_MESSAGE } from '../../shared/custom-code/card-source-admission.ts'

export type WorkshopCardForGen = {
  id: string
  card_id: string
  card_type: string
  author_name?: string
  description?: string
  effect_code: string
}

export type CardLocaleEntry = {
  name: string
  desc: string[]
  rules?: string[]
  prerequisite?: string
}

export type CardLocales = Record<string, CardLocaleEntry>

function readLocalesFromCardJson(cardJson: string | undefined): CardLocales | null {
  if (!cardJson) return null
  let parsed: { locales?: unknown } = {}
  try {
    parsed = JSON.parse(cardJson) as { locales?: unknown }
  } catch {
    return null
  }
  const raw = parsed.locales
  if (!raw || typeof raw !== 'object') return null
  const result: CardLocales = {}
  for (const [lang, entryRaw] of Object.entries(raw as Record<string, unknown>)) {
    if (!entryRaw || typeof entryRaw !== 'object') continue
    const entry = entryRaw as Partial<CardLocaleEntry>
    if (typeof entry.name !== 'string' || !Array.isArray(entry.desc)) continue
    const desc = entry.desc.filter((line): line is string => typeof line === 'string')
    const rules = Array.isArray(entry.rules)
      ? entry.rules.filter((line): line is string => typeof line === 'string')
      : []
    if (entry.name.length === 0 && desc.length === 0) continue
    result[lang] = {
      name: entry.name,
      desc,
      ...(rules.length > 0 ? { rules } : {}),
      ...(typeof entry.prerequisite === 'string' && entry.prerequisite.length > 0
        ? { prerequisite: entry.prerequisite }
        : {}),
    }
  }
  return Object.keys(result).length > 0 ? result : null
}

export function generateLanguagePatch(wcard: WorkshopCardForGen & { card_json?: string }) {
  const prefix = wcard.card_type === 'occupation' ? 'occupations' : 'minorImprovements'
  return Object.fromEntries(Object.entries(readLocalesFromCardJson(wcard.card_json) ?? {}).map(([locale, entry]) => [locale, {
    [prefix]: { [wcard.card_id]: {
      name: entry.name, description: entry.desc.join('\n'),
      ...(entry.rules?.length ? { rules: entry.rules.join('\n') } : {}),
      ...(entry.prerequisite ? { prerequisite: entry.prerequisite } : {}),
    } },
  }]))
}

function propertyNameMatches(name: ts.PropertyName, expected: string): boolean {
  return (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    && name.text === expected
}

/**
 * A Workshop draft (ADR 0052) is already the Card Source module its pull
 * request adds: drop translations, which ship as a separate language patch,
 * set the adopted artwork, and add the `_impl` export the registry imports.
 */
function generateNativeCardSourceFile(
  wcard: WorkshopCardForGen & { card_json?: string },
  ctx: { githubLogin: string; iso: string; artUrl?: string | null },
): string {
  const sf = ts.createSourceFile(`${wcard.card_id}.ts`, wcard.effect_code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const transformer: ts.TransformerFactory<ts.SourceFile> = context => {
    const { factory } = context
    const visit = (node: ts.Node): ts.Node => {
      if (ts.isPropertyAssignment(node) && propertyNameMatches(node.name, 'meta') && ts.isObjectLiteralExpression(node.initializer)
        && ts.isCallExpression(node.parent.parent) && ts.isIdentifier(node.parent.parent.expression)
        && ['defineMinorCard', 'defineOccupationCard'].includes(node.parent.parent.expression.text)) {
        const kept = node.initializer.properties.filter(property => !(ts.isPropertyAssignment(property)
          && (propertyNameMatches(property.name, 'locales') || propertyNameMatches(property.name, 'artUrl'))))
        const art = ctx.artUrl ? [factory.createPropertyAssignment('artUrl', factory.createStringLiteral(ctx.artUrl))] : []
        return factory.updatePropertyAssignment(node, node.name, factory.updateObjectLiteralExpression(node.initializer, [...kept, ...art]))
      }
      return ts.visitEachChild(node, visit, context)
    }
    return node => ts.visitEachChild(node, visit, context)
  }
  const result = ts.transform(sf, [transformer])
  let body: string
  try {
    body = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(result.transformed[0]!).trim()
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
  } finally {
    result.dispose()
  }
  return `// Generated from Open Agricola workshop. Do not hand-edit.
// Workshop card: ${wcard.card_id}
// Author: ${(wcard.author_name ?? 'unknown').replace(/[\r\n\u2028\u2029]/g, ' ')}${ctx.githubLogin ? ` (github: @${ctx.githubLogin})` : ''}
// Submitted: ${ctx.iso}
${wcard.description ? `// Description: ${wcard.description.replace(/[\r\n\u2028\u2029]/g, ' ')}\n` : ''}
${body}

export const ${wcard.card_id}_impl = ${wcard.card_id}.impl
`
}

export function generateCardSourceFile(
  wcard: WorkshopCardForGen & { card_json?: string },
  ctx: { githubLogin: string; iso: string; artUrl?: string | null },
): string {
  if (!isNativeCardSource(wcard.effect_code)) throw new Error(LEGACY_CARD_SOURCE_MESSAGE)
  return generateNativeCardSourceFile(wcard, ctx)
}


// ---------------------------------------------------------------------------
// C-15: register-all.ts patcher
// ---------------------------------------------------------------------------

/**
 * Insert a new CUSTOM_* import and ALL_CARD_IMPLS entry into register-all.ts,
 * keeping CUSTOM_* entries sorted alphabetically among themselves. Idempotent:
 * returns the input unchanged if the card is already registered.
 */
export function patchRegisterAll(
  source: string,
  args: { card_id: string },
): string {
  const id = args.card_id
  const newImport = `import { ${id} } from './community/${id}'`
  const newEntry = `  '${id}': ${id}.impl,`

  if (source.includes(newImport)) return source

  const importRe = /^(import \{ (\w+) \} from '[^']+')\n/gm
  const imports: Array<{
    full: string
    id: string
    start: number
    end: number
  }> = []
  let m: RegExpExecArray | null
  while ((m = importRe.exec(source)) !== null) {
    imports.push({
      full: m[0]!,
      id: m[2]!,
      start: m.index,
      end: m.index + m[0]!.length,
    })
  }

  let withImport: string
  if (imports.length === 0) {
    const anchor = '\nexport const ALL_CARD_IMPLS'
    const idx = source.indexOf(anchor)
    if (idx === -1) {
      throw new Error(
        'register-all.ts structure not recognized (missing ALL_CARD_IMPLS)',
      )
    }
    withImport = source.slice(0, idx) + '\n' + newImport + source.slice(idx)
  } else {
    let insertedBefore: { start: number } | null = null
    for (const ci of imports) {
      if (ci.id.localeCompare(id) > 0) {
        insertedBefore = { start: ci.start }
        break
      }
    }
    if (insertedBefore) {
      withImport =
        source.slice(0, insertedBefore.start) +
        newImport +
        '\n' +
        source.slice(insertedBefore.start)
    } else {
      const last = imports[imports.length - 1]!
      withImport =
        source.slice(0, last.end) + newImport + '\n' + source.slice(last.end)
    }
  }

  const entryRe = /^ {2}'(\w+)': [^\n]*,\n/gm
  const entries: Array<{
    full: string
    id: string
    start: number
    end: number
  }> = []
  let em: RegExpExecArray | null
  while ((em = entryRe.exec(withImport)) !== null) {
    entries.push({
      full: em[0]!,
      id: em[1]!,
      start: em.index,
      end: em.index + em[0]!.length,
    })
  }

  let final: string
  if (entries.length === 0) {
    const anchor = '\n}\n\nexport type AllCardImpls'
    const idx = withImport.indexOf(anchor)
    if (idx === -1) {
      throw new Error(
        'register-all.ts structure not recognized (missing closing brace)',
      )
    }
    final =
      withImport.slice(0, idx) + '\n' + newEntry + withImport.slice(idx)
  } else {
    let insertedBefore: { start: number } | null = null
    for (const ce of entries) {
      if (ce.id.localeCompare(id) > 0) {
        insertedBefore = { start: ce.start }
        break
      }
    }
    if (insertedBefore) {
      final =
        withImport.slice(0, insertedBefore.start) +
        newEntry +
        '\n' +
        withImport.slice(insertedBefore.start)
    } else {
      const last = entries[entries.length - 1]!
      final =
        withImport.slice(0, last.end) +
        newEntry +
        '\n' +
        withImport.slice(last.end)
    }
  }

  return final
}

function unwrapExpression(expr: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isTypeAssertionExpression(expr) ||
    ts.isSatisfiesExpression(expr)
  ) {
    return unwrapExpression(expr.expression)
  }
  return expr
}

function collectStaticConstInitializers(sf: ts.SourceFile): Map<string, ts.Expression> {
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

function staticJsonLikeValue(
  expr: ts.Expression,
  constants: Map<string, ts.Expression>,
  context: string,
  seen = new Set<string>(),
): unknown {
  const unwrapped = unwrapExpression(expr)
  if (ts.isStringLiteral(unwrapped) || ts.isNoSubstitutionTemplateLiteral(unwrapped)) {
    return unwrapped.text
  }
  if (ts.isNumericLiteral(unwrapped)) return Number(unwrapped.text)
  if (
    ts.isPrefixUnaryExpression(unwrapped)
    && unwrapped.operator === ts.SyntaxKind.MinusToken
    && ts.isNumericLiteral(unwrapped.operand)
  ) {
    return -Number(unwrapped.operand.text)
  }
  if (unwrapped.kind === ts.SyntaxKind.TrueKeyword) return true
  if (unwrapped.kind === ts.SyntaxKind.FalseKeyword) return false
  if (unwrapped.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isIdentifier(unwrapped)) {
    const initializer = constants.get(unwrapped.text)
    if (!initializer) throw new Error(`${context}: unresolved identifier ${unwrapped.text}`)
    if (seen.has(unwrapped.text)) throw new Error(`${context}: circular identifier ${unwrapped.text}`)
    const nextSeen = new Set(seen)
    nextSeen.add(unwrapped.text)
    return staticJsonLikeValue(initializer, constants, context, nextSeen)
  }
  if (ts.isArrayLiteralExpression(unwrapped)) {
    return unwrapped.elements.map((element, index) => {
      if (ts.isSpreadElement(element)) {
        throw new Error(`${context}[${index}]: spread is not supported`)
      }
      return staticJsonLikeValue(element, constants, `${context}[${index}]`, seen)
    })
  }
  if (ts.isObjectLiteralExpression(unwrapped)) {
    const out: Record<string, unknown> = {}
    for (const prop of unwrapped.properties) {
      if (ts.isSpreadAssignment(prop)) {
        const spread = staticJsonLikeValue(prop.expression, constants, `${context}.<spread>`, seen)
        if (!spread || typeof spread !== 'object' || Array.isArray(spread)) {
          throw new Error(`${context}: spread must resolve to an object`)
        }
        Object.assign(out, spread)
        continue
      }
      if (!ts.isPropertyAssignment(prop)) {
        throw new Error(`${context}: only property assignments are supported`)
      }
      const key = propertyNameMatches(prop.name, prop.name.getText())
        ? prop.name.getText()
        : prop.name.getText().replace(/["']/g, '')
      out[key] = staticJsonLikeValue(prop.initializer, constants, `${context}.${key}`, seen)
    }
    return out
  }
  throw new Error(`${context}: expression is not static JSON-like`)
}

function extractGeneratedCardMeta(cardContent: string, cardId: string): Record<string, unknown> {
  const sf = ts.createSourceFile(
    `${cardId}.ts`,
    cardContent,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  )
  const constants = collectStaticConstInitializers(sf)
  let metaExpression: ts.Expression | null = null
  const visit = (node: ts.Node): void => {
    if (metaExpression) return
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && (
        node.expression.text === 'defineMinorCard'
        || node.expression.text === 'defineOccupationCard'
        || node.expression.text === 'definePlayerActionCard'
      )
    ) {
      const arg = node.arguments[0]
      if (!arg || !ts.isObjectLiteralExpression(arg)) return
      const metaProp = arg.properties.find(
        (prop): prop is ts.PropertyAssignment =>
          ts.isPropertyAssignment(prop) && propertyNameMatches(prop.name, 'meta'),
      )
      if (metaProp) metaExpression = metaProp.initializer
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  if (!metaExpression) throw new Error(`${cardId}: generated Card Source meta not found`)
  const meta = staticJsonLikeValue(metaExpression, constants, `${cardId}.meta`)
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    throw new Error(`${cardId}: generated Card Source meta must be an object`)
  }
  const out = meta as Record<string, unknown>
  if (out.id !== cardId) {
    throw new Error(`${cardId}: generated Card Source meta.id mismatch`)
  }
  return out
}

function cardKind(cardType: string): 'minor' | 'occupation' {
  return cardType === 'occupation' ? 'occupation' : 'minor'
}

function catalogEntryLiteral(meta: Record<string, unknown>, cardType: string): string[] {
  const lines = JSON.stringify({ ...meta, kind: cardKind(cardType) }, null, 2)
    .split('\n')
    .map((line) => `  ${line}`)
  lines[lines.length - 1] = `${lines[lines.length - 1]},`
  return lines
}

export function patchCatalogGenerated(
  source: string,
  args: { card_id: string; card_type: string; card_content: string },
): string {
  if (source.includes(`"id": "${args.card_id}"`)) return source
  const meta = extractGeneratedCardMeta(args.card_content, args.card_id)
  const entryLines = catalogEntryLiteral(meta, args.card_type)
  const lines = source.split('\n')
  const idRe = /^\s+"id": "([^"]+)",?$/
  let insertAt: number | null = null
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i]!.match(idRe)
    if (!match) continue
    if (match[1]!.localeCompare(args.card_id) <= 0) continue
    for (let j = i; j >= 0; j -= 1) {
      if (lines[j] === '  {') {
        insertAt = j
        break
      }
    }
    break
  }
  if (insertAt === null) {
    insertAt = lines.findIndex((line) => line === ']')
  }
  if (insertAt === -1) {
    throw new Error('catalog.generated.ts structure not recognized')
  }
  lines.splice(insertAt, 0, ...entryLines)
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// C-16: community_cards.md patcher
// ---------------------------------------------------------------------------

export function patchCommunityCardsMarkdown(
  source: string,
  args: {
    card_id: string
    card_name: string
    card_type: string
    github_login: string
    pr_number: number
    designer_name?: string
  },
): string {
  const designer = args.designer_name?.replace(/[|\r\n]/g, ' ').replaceAll('@', '@\u200b') ?? `@${args.github_login}`
  const row = `| ${args.card_id} | ${args.card_name} | ${args.card_type} | ${designer} | #${args.pr_number} |`
  if (source.includes(`| ${args.card_id} |`)) return source
  const endMarker = '<!-- community-card-entries:end -->'
  const idx = source.indexOf(endMarker)
  if (idx === -1) throw new Error('community_cards.md markers not found')
  return source.slice(0, idx) + row + '\n' + source.slice(idx)
}

// ---------------------------------------------------------------------------
// C-17: generatePrFiles main entry
// ---------------------------------------------------------------------------

export type PrFile = {
  path: string
  content: string
  encoding: 'utf-8' | 'base64'
}

export type GenArgs = {
  wcard: WorkshopCardForGen & { card_json?: string; art_url?: string | null }
  github_login: string
  upstream_register_all: string
  upstream_catalog_generated: string
  upstream_community_md: string
  pr_number: number
  designer_name?: string
  art_data?: { ext: string; buffer: Buffer } | null
}

export async function generatePrFiles(args: GenArgs): Promise<PrFile[]> {
  const {
    wcard,
    github_login,
    upstream_register_all,
    upstream_catalog_generated,
    upstream_community_md,
    pr_number,
    art_data,
  } = args
  const iso = new Date().toISOString()
  const artUrl = art_data
    ? `/card-art/community/${wcard.card_id}.${art_data.ext}`
    : undefined

  const cardContent = generateCardSourceFile(wcard, {
    githubLogin: github_login,
    iso,
    artUrl,
  })
  const newRegisterAll = patchRegisterAll(upstream_register_all, {
    card_id: wcard.card_id,
  })
  const newCatalogGenerated = patchCatalogGenerated(upstream_catalog_generated, {
    card_id: wcard.card_id,
    card_type: wcard.card_type,
    card_content: cardContent,
  })

  let cardName = wcard.card_id
  try {
    if (wcard.card_json) {
      const parsed = JSON.parse(wcard.card_json) as { name?: string }
      if (parsed.name) cardName = parsed.name
    }
  } catch {
    /* keep fallback */
  }

  const newCommunityMd = patchCommunityCardsMarkdown(upstream_community_md, {
    card_id: wcard.card_id,
    card_name: cardName,
    card_type: wcard.card_type,
    github_login,
    pr_number,
    designer_name: args.designer_name,
  })

  const files: PrFile[] = [
    {
      path: `shared/cards/community/${wcard.card_id}.ts`,
      content: cardContent,
      encoding: 'utf-8',
    },
    {
      path: 'shared/cards/register-all.ts',
      content: newRegisterAll,
      encoding: 'utf-8',
    },
    {
      path: 'shared/cards/catalog.generated.ts',
      content: newCatalogGenerated,
      encoding: 'utf-8',
    },
    {
      path: 'docs/community_cards.md',
      content: newCommunityMd,
      encoding: 'utf-8',
    },
  ]

  if (art_data) {
    files.push({
      path: `public/card-art/community/${wcard.card_id}.${art_data.ext}`,
      content: art_data.buffer.toString('base64'),
      encoding: 'base64',
    })
  }

  return files
}
