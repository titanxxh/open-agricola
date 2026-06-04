/**
 * Pure code-generation module for workshop → PR integration.
 *
 * Given a workshop card row + upstream file contents, produce the 5-6 files
 * that should be committed to a fork branch:
 *   1. shared/cards/community/{card_id}.ts              — main card file
 *   2. shared/cards/community/__tests__/{card_id}.test.ts — smoke test
 *   3. shared/cards/register-all.ts                     — canonical generated file
 *   4. shared/cards/catalog.generated.ts                — canonical generated file
 *   5. docs/community_cards.md                          — patched (new row)
 *   6. public/card-art/community/{card_id}.{ext}        — (optional) binary art
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { buildRegisterAll } from '../../scripts/generate-register-all'

// ---------------------------------------------------------------------------
// C-12: AST helper scan
// ---------------------------------------------------------------------------

const KNOWN_HELPERS = new Set([
  'gainLeaf',
  'payLeaf',
  'spaceHasPlayer',
  'positionKey',
  'getCardDefinition',
  'getCardStack',
  'readCardExtraData',
])

/**
 * Walk the user-supplied effect_code AST and return the subset of injected
 * helpers that are actually referenced. Used to emit a minimal import list
 * in the generated card file.
 */
export function scanUsedHelpers(source: string): Set<string> {
  const used = new Set<string>()
  const sf = ts.createSourceFile(
    'x.ts',
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  )
  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node) && KNOWN_HELPERS.has(node.text)) {
      used.add(node.text)
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(sf, visit)
  return used
}

// ---------------------------------------------------------------------------
// C-13: Main card file generator
// ---------------------------------------------------------------------------

const HELPER_IMPORTS: Record<string, string> = {
  gainLeaf: `import { gainLeaf } from '../helpers/pay-gain-node'`,
  payLeaf: `import { payLeaf } from '../helpers/pay-gain-node'`,
  spaceHasPlayer: `import { spaceHasPlayer } from '../../domain/space'`,
  positionKey: `import { positionKey } from '../../domain/farm'`,
  getCardDefinition: `import { getCardDefinition } from '../catalog'`,
  getCardStack: `import { getCardStack } from '../helpers/card-state'`,
  readCardExtraData: `import { readCardExtraData } from '../helpers/card-state'`,
}

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
    if (entry.name.length === 0 && desc.length === 0) continue
    result[lang] = {
      name: entry.name,
      desc,
      ...(typeof entry.prerequisite === 'string' && entry.prerequisite.length > 0
        ? { prerequisite: entry.prerequisite }
        : {}),
    }
  }
  return Object.keys(result).length > 0 ? result : null
}

function buildLocalesLiteral(
  factory: ts.NodeFactory,
  locales: CardLocales,
): ts.ObjectLiteralExpression {
  const langProps: ts.PropertyAssignment[] = []
  for (const [lang, entry] of Object.entries(locales)) {
    if (!entry || typeof entry.name !== 'string' || !Array.isArray(entry.desc)) continue
    const fields: ts.PropertyAssignment[] = [
      factory.createPropertyAssignment('name', factory.createStringLiteral(entry.name)),
      factory.createPropertyAssignment(
        'desc',
        factory.createArrayLiteralExpression(
          entry.desc.map((line) => factory.createStringLiteral(line)),
          false,
        ),
      ),
    ]
    if (typeof entry.prerequisite === 'string' && entry.prerequisite.length > 0) {
      fields.push(
        factory.createPropertyAssignment(
          'prerequisite',
          factory.createStringLiteral(entry.prerequisite),
        ),
      )
    }
    langProps.push(
      factory.createPropertyAssignment(
        lang,
        factory.createObjectLiteralExpression(fields, true),
      ),
    )
  }
  return factory.createObjectLiteralExpression(langProps, true)
}

/**
 * Walk a function body and report whether any Identifier inside it spells
 * `name`. Used to decide whether a function parameter is actually consumed,
 * so we can rename unused params with a `_` prefix and avoid TS6133 errors
 * on the upstream build.
 *
 * Conservative: nested functions that re-declare the same name still count
 * as "used" (the body identifier matches by spelling), which keeps us from
 * accidentally renaming a param that is in fact referenced. False-positive
 * safe.
 */
function isIdentifierReferencedInBody(body: ts.Node, name: string): boolean {
  let found = false
  function visit(node: ts.Node): void {
    if (found) return
    if (ts.isIdentifier(node) && node.text === name) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(body)
  return found
}

function propertyNameMatches(name: ts.PropertyName, expected: string): boolean {
  return (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    && name.text === expected
}

function getNumericObjectProperty(object: ts.ObjectLiteralExpression, key: string): number | null {
  for (const prop of object.properties) {
    if (
      ts.isPropertyAssignment(prop)
      && propertyNameMatches(prop.name, key)
      && ts.isNumericLiteral(prop.initializer)
    ) {
      return Number(prop.initializer.text)
    }
  }
  return null
}

function normalizeWorkshopEffectCode(
  source: string,
  cardId: string,
  opts: { locales?: CardLocales | null } = {},
): string {
  const sf = ts.createSourceFile(
    `${cardId}.ts`,
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  )

  const localesToInject = opts.locales && Object.keys(opts.locales).length > 0
    ? opts.locales
    : null

  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const { factory } = context
    const syncLocalesObject = (object: ts.ObjectLiteralExpression) => {
      const filtered: ts.ObjectLiteralElementLike[] = []
      for (const prop of object.properties) {
        if (
          ts.isPropertyAssignment(prop)
          && propertyNameMatches(prop.name, 'locales')
        ) {
          continue
        }
        filtered.push(prop)
      }
      if (localesToInject) {
        filtered.push(
          factory.createPropertyAssignment(
            'locales',
            buildLocalesLiteral(factory, localesToInject),
          ),
        )
      }
      return factory.updateObjectLiteralExpression(object, filtered)
    }
    const visit: ts.Visitor = (node) => {
      // Sync the CARD_DEF locales field with card_json.locales (db is the
      // source of truth; LLM-generated locales in source may be stale once
      // the user edits via the LocalizationModal). Drop any existing
      // `locales:` property and re-emit from `localesToInject`.
      if (
        ts.isNewExpression(node)
        && ts.isIdentifier(node.expression)
        && (node.expression.text === 'MinorImprovement' || node.expression.text === 'Occupation')
        && node.arguments?.length === 1
      ) {
        const arg = node.arguments[0]!
        if (ts.isObjectLiteralExpression(arg)) {
          const updatedArg = syncLocalesObject(arg)
          return ts.visitEachChild(
            factory.updateNewExpression(node, node.expression, node.typeArguments, [updatedArg]),
            visit,
            context,
          )
        }
      }

      if (
        ts.isPropertyAssignment(node)
        && propertyNameMatches(node.name, 'meta')
        && ts.isObjectLiteralExpression(node.initializer)
      ) {
        return ts.visitEachChild(
          factory.updatePropertyAssignment(
            node,
            node.name,
            syncLocalesObject(node.initializer),
          ),
          visit,
          context,
        )
      }

      if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.name.text === 'CARD_IMPL'
      ) {
        const initializer = node.initializer
          ? ts.visitNode(node.initializer, visit) as ts.Expression
          : undefined
        return factory.updateVariableDeclaration(
          node,
          node.name,
          node.exclamationToken,
          node.type ?? factory.createTypeReferenceNode('CardImpl'),
          initializer,
        )
      }

      if (ts.isObjectLiteralExpression(node)) {
        let changed = false
        const properties: ts.ObjectLiteralElementLike[] = []
        for (const prop of node.properties) {
          if (
            ts.isPropertyAssignment(prop)
            && propertyNameMatches(prop.name, 'prerequisite')
            && ts.isObjectLiteralExpression(prop.initializer)
          ) {
            const occupationCount = getNumericObjectProperty(prop.initializer, 'occupation')
            if (occupationCount !== null) {
              changed = true
              properties.push(
                factory.createPropertyAssignment(
                  'prerequisite',
                  factory.createStringLiteral(`${occupationCount} Occupations`),
                ),
                factory.createPropertyAssignment(
                  'occupationPrerequisites',
                  factory.createObjectLiteralExpression([
                    factory.createPropertyAssignment(
                      'min',
                      factory.createNumericLiteral(occupationCount),
                    ),
                  ], false),
                ),
              )
              continue
            }
          }
          properties.push(prop)
        }
        if (changed) {
          return ts.visitEachChild(
            factory.updateObjectLiteralExpression(node, properties),
            visit,
            context,
          )
        }
      }

      if (ts.isPropertyAssignment(node)) {
        if (
          propertyNameMatches(node.name, 'deck')
          && ts.isStringLiteralLike(node.initializer)
          && node.initializer.text === 'CUSTOM'
        ) {
          return factory.updatePropertyAssignment(
            node,
            node.name,
            factory.createStringLiteral('community'),
          )
        }

        if (propertyNameMatches(node.name, 'listeners') && ts.isArrayLiteralExpression(node.initializer)) {
          let listenerIndex = 0
          const elements = node.initializer.elements.map((element) => {
            if (!ts.isObjectLiteralExpression(element)) return element
            listenerIndex += 1
            const hasId = element.properties.some((prop) =>
              ts.isPropertyAssignment(prop) && propertyNameMatches(prop.name, 'id'))
            if (hasId) return element
            return factory.updateObjectLiteralExpression(element, [
              factory.createPropertyAssignment(
                'id',
                factory.createStringLiteral(`${cardId}-listener-${listenerIndex}`),
              ),
              ...element.properties,
            ])
          })
          return factory.updatePropertyAssignment(
            node,
            node.name,
            factory.updateArrayLiteralExpression(node.initializer, elements),
          )
        }
      }
      return ts.visitEachChild(node, visit, context)
    }
    return (node) => ts.visitNode(node, visit) as ts.SourceFile
  }

  // Second pass: rename unused arrow/function-expression parameters with a
  // `_` prefix so the upstream `tsc -b` build doesn't trip TS6133. Run as a
  // separate transform because the first pass returns updated PropertyAssignment
  // nodes (e.g. for `listeners:`) without recursing into their children — the
  // arrow functions inside listener objects would otherwise never be visited.
  const unusedParamsTransformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const { factory } = context
    const visit: ts.Visitor = (node) => {
      if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        const visitedBody = ts.visitNode(node.body, visit) as ts.ConciseBody
        let changed = visitedBody !== node.body
        const newParams = node.parameters.map((p) => {
          if (!ts.isIdentifier(p.name)) return p
          const paramName = p.name.text
          if (paramName.startsWith('_')) return p
          if (isIdentifierReferencedInBody(visitedBody, paramName)) return p
          changed = true
          return factory.updateParameterDeclaration(
            p,
            p.modifiers,
            p.dotDotDotToken,
            factory.createIdentifier(`_${paramName}`),
            p.questionToken,
            p.type,
            p.initializer,
          )
        })
        if (!changed) return node
        if (ts.isArrowFunction(node)) {
          return factory.updateArrowFunction(
            node,
            node.modifiers,
            node.typeParameters,
            newParams,
            node.type,
            node.equalsGreaterThanToken,
            visitedBody,
          )
        }
        return factory.updateFunctionExpression(
          node,
          node.modifiers,
          node.asteriskToken,
          node.name,
          node.typeParameters,
          newParams,
          node.type,
          visitedBody as ts.Block,
        )
      }
      return ts.visitEachChild(node, visit, context)
    }
    return (node) => ts.visitNode(node, visit) as ts.SourceFile
  }

  const result = ts.transform(sf, [transformer, unusedParamsTransformer])
  try {
    const printed = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
      .printFile(result.transformed[0]!)
      .trim()
    // ts.createPrinter escapes every non-ASCII character to \uXXXX even though
    // the project source files store CJK literals verbatim. Reverse that so the
    // generated card file matches the rest of the codebase.
    return printed.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
  } finally {
    result.dispose()
  }
}

/**
 * Extract a top-level const VariableStatement by name from sandbox source.
 */
function findTopLevelConst(
  sf: ts.SourceFile,
  name: string,
): ts.VariableStatement | null {
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    const decl = stmt.declarationList.declarations[0]
    if (!decl || !ts.isIdentifier(decl.name)) continue
    if (decl.name.text === name) return stmt
  }
  return null
}

/**
 * Print top-level statements with two normalizations:
 * - Strip TS printer's trailing semicolons (line-end `;`) so the output style
 *   matches `normalizeWorkshopEffectCode`'s `printer.printFile()` path which
 *   omits them. Without this, hand-written fixtures and generator output drift.
 * - Reverse `\\uXXXX` escapes back to their UTF-8 codepoints (TS printer
 *   defaults to escaping every non-ASCII character) so generated files
 *   match repo convention of verbatim CJK literals.
 */
function printStatements(sf: ts.SourceFile, stmts: ts.Statement[]): string {
  if (stmts.length === 0) return ''
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
  return stmts
    .map((s) => printer.printNode(ts.EmitHint.Unspecified, s, sf))
    .join('\n')
    .replace(/;$/gm, '')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
}

export function extractCardDefSource(source: string): string {
  const sf = ts.createSourceFile(
    'in.ts',
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  )
  const cardId = findTopLevelConst(sf, 'CARD_ID')
  const cardDef = findTopLevelConst(sf, 'CARD_DEF')
  if (!cardDef) {
    throw new Error('CARD_DEF top-level const not found in workshop code')
  }
  const stmts: ts.Statement[] = []
  if (cardId) stmts.push(cardId)
  stmts.push(cardDef)
  return printStatements(sf, stmts)
}

export function extractCardImplSource(source: string): string {
  const sf = ts.createSourceFile(
    'in.ts',
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  )
  const cardId = findTopLevelConst(sf, 'CARD_ID')
  const cardImpl = findTopLevelConst(sf, 'CARD_IMPL')
  if (!cardImpl) return 'const CARD_IMPL = {}'
  const stmts: ts.Statement[] = []
  if (cardId) stmts.push(cardId)
  stmts.push(cardImpl)
  return printStatements(sf, stmts)
}

function expressionToSource(sf: ts.SourceFile, expr: ts.Expression): string {
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
  return printer
    .printNode(ts.EmitHint.Expression, expr, sf)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
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

export function extractCardMetaSource(source: string): string {
  const sf = ts.createSourceFile(
    'in.ts',
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  )
  const cardDef = findTopLevelConst(sf, 'CARD_DEF')
  if (!cardDef) {
    throw new Error('CARD_DEF top-level const not found in workshop code')
  }
  const decl = cardDef.declarationList.declarations[0]
  if (!decl?.initializer) {
    throw new Error('CARD_DEF initializer not found in workshop code')
  }
  const initializer = unwrapExpression(decl.initializer)
  if (ts.isNewExpression(initializer)) {
    const arg = initializer.arguments?.[0]
    if (arg && ts.isObjectLiteralExpression(arg)) return expressionToSource(sf, arg)
  }
  if (ts.isObjectLiteralExpression(initializer)) {
    const metaProp = initializer.properties.find(
      (prop): prop is ts.PropertyAssignment =>
        ts.isPropertyAssignment(prop) && propertyNameMatches(prop.name, 'meta'),
    )
    if (metaProp) {
      const meta = unwrapExpression(metaProp.initializer)
      if (ts.isObjectLiteralExpression(meta)) return expressionToSource(sf, meta)
    }
    return expressionToSource(sf, initializer)
  }
  throw new Error('CARD_DEF must be an object literal')
}

function cardSourceImport(cardType: string): string {
  return cardType === 'occupation'
    ? `import { defineOccupationCard } from '../card-source'`
    : `import { defineMinorCard } from '../card-source'`
}

function cardSourceFactory(cardType: string): string {
  return cardType === 'occupation' ? 'defineOccupationCard' : 'defineMinorCard'
}

export function generateCardSourceFile(
  wcard: WorkshopCardForGen & { card_json?: string },
  ctx: { githubLogin: string; iso: string },
): string {
  const used = scanUsedHelpers(wcard.effect_code)
  const helperImports = Array.from(used)
    .map((h) => HELPER_IMPORTS[h])
    .filter((x): x is string => !!x)
    .sort()
    .join('\n')

  const locales = readLocalesFromCardJson(wcard.card_json)
  const normalised = normalizeWorkshopEffectCode(wcard.effect_code, wcard.card_id, { locales })
  const cardMetaSource = extractCardMetaSource(normalised)
  const cardImplSource = extractCardImplSource(normalised)
  const cardImplWithId = cardImplSource.includes('const CARD_ID')
    ? cardImplSource
    : `const CARD_ID = '${wcard.card_id}'\n${cardImplSource}`
  const factory = cardSourceFactory(wcard.card_type)

  return `// Generated from Open Agricola workshop. Do not hand-edit.
// Workshop card: ${wcard.card_id}
// Author: ${wcard.author_name ?? 'unknown'} (github: @${ctx.githubLogin})
// Submitted: ${ctx.iso}

${cardSourceImport(wcard.card_type)}
import type { CardImpl } from '../registry'
${helperImports ? '\n' + helperImports : ''}

${cardImplWithId}

const cardImpl = CARD_IMPL satisfies CardImpl

export const ${wcard.card_id} = ${factory}({
  meta: ${cardMetaSource},
  impl: cardImpl,
})

export const ${wcard.card_id}_impl = ${wcard.card_id}.impl
`
}

export const generateDisplayFile = generateCardSourceFile
export const generateImplFile = generateCardSourceFile

// ---------------------------------------------------------------------------
// C-14: Smoke test generator
// ---------------------------------------------------------------------------

export function generateSmokeTest(args: { card_id: string }): string {
  const id = args.card_id
  return `import { describe, it, expect } from 'vitest'
import { ${id}, ${id}_impl } from '../${id}'

describe('${id} — community card smoke test', () => {
  it('exports a valid definition', () => {
    expect(${id}).toBeDefined()
    expect(${id}.id).toBe('${id}')
    expect(${id}.name).toBeTruthy()
    expect(${id}.deck).toBe('community')
  })

  it('exports a CardImpl', () => {
    expect(${id}_impl).toBeDefined()
    const hasBehavior =
      !!${id}_impl.effect ||
      (${id}_impl.listeners?.length ?? 0) > 0 ||
      (${id}_impl.modifiers?.length ?? 0) > 0 ||
      (${id}.vp ?? 0) > 0
    expect(hasBehavior).toBe(true)
  })
})
`
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

  // === Insert import ===
  const customImportRe = /^(import \{ (CUSTOM_\w+) \} from '\.\/community\/CUSTOM_\w+')\n/gm
  const customImports: Array<{
    full: string
    id: string
    start: number
    end: number
  }> = []
  let m: RegExpExecArray | null
  while ((m = customImportRe.exec(source)) !== null) {
    customImports.push({
      full: m[0]!,
      id: m[2]!,
      start: m.index,
      end: m.index + m[0]!.length,
    })
  }

  let withImport: string
  if (customImports.length === 0) {
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
    for (const ci of customImports) {
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
      const last = customImports[customImports.length - 1]!
      withImport =
        source.slice(0, last.end) + newImport + '\n' + source.slice(last.end)
    }
  }

  // === Insert entry ===
  const customEntryRe = /^ {2}'(CUSTOM_\w+)': [^\n]*,\n/gm
  const customEntries: Array<{
    full: string
    id: string
    start: number
    end: number
  }> = []
  let em: RegExpExecArray | null
  while ((em = customEntryRe.exec(withImport)) !== null) {
    customEntries.push({
      full: em[0]!,
      id: em[1]!,
      start: em.index,
      end: em.index + em[0]!.length,
    })
  }

  let final: string
  if (customEntries.length === 0) {
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
    for (const ce of customEntries) {
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
      const last = customEntries[customEntries.length - 1]!
      final =
        withImport.slice(0, last.end) +
        newEntry +
        '\n' +
        withImport.slice(last.end)
    }
  }

  return final
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
  },
): string {
  const row = `| ${args.card_id} | ${args.card_name} | ${args.card_type} | @${args.github_login} | #${args.pr_number} |`
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
  upstream_community_md: string
  pr_number: number
  art_data?: { ext: string; buffer: Buffer } | null
}

function generateCanonicalCardFiles(cardPath: string, cardContent: string) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'oa-workshop-card-gen-'))
  try {
    const cardsSource = path.resolve(process.cwd(), 'shared', 'cards')
    const cardsDest = path.join(tmp, 'shared', 'cards')
    cpSync(cardsSource, cardsDest, { recursive: true })
    const dest = path.join(tmp, cardPath)
    mkdirSync(path.dirname(dest), { recursive: true })
    writeFileSync(dest, cardContent, 'utf8')
    const generated = buildRegisterAll({ repoRoot: tmp })
    return {
      registerAll: generated.registerAll,
      catalogGenerated: generated.catalogGenerated,
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

export async function generatePrFiles(args: GenArgs): Promise<PrFile[]> {
  const {
    wcard,
    github_login,
    upstream_community_md,
    pr_number,
    art_data,
  } = args
  const iso = new Date().toISOString()

  const cardContent = generateCardSourceFile(wcard, {
    githubLogin: github_login,
    iso,
  })
  const testContent = generateSmokeTest({ card_id: wcard.card_id })
  const generated = generateCanonicalCardFiles(
    `shared/cards/community/${wcard.card_id}.ts`,
    cardContent,
  )

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
  })

  const files: PrFile[] = [
    {
      path: `shared/cards/community/${wcard.card_id}.ts`,
      content: cardContent,
      encoding: 'utf-8',
    },
    {
      path: `shared/cards/community/__tests__/${wcard.card_id}.test.ts`,
      content: testContent,
      encoding: 'utf-8',
    },
    {
      path: 'shared/cards/register-all.ts',
      content: generated.registerAll,
      encoding: 'utf-8',
    },
    {
      path: 'shared/cards/catalog.generated.ts',
      content: generated.catalogGenerated,
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
