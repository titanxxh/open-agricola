/**
 * Structural admission of a Workshop card written as a native Card Source
 * module (ADR 0052). Nothing here executes the source: the server validates
 * and stores it, and only the opaque browser Worker runs it.
 *
 * Checks: one exported `define{Minor,Occupation}Card({ meta, impl })` named
 * after the card ID; relative imports that stay inside non-test `shared/`
 * modules; and a statically readable `meta` whose `id` is that card ID and
 * whose deck is `community`. Behavior is the job of the card's tests.
 */
import ts from 'typescript'

export const CARD_SOURCE_DIRECTORY = 'shared/cards/community'
const DEFINERS = { defineMinorCard: 'minor', defineOccupationCard: 'occupation' } as const
const IMPORTABLE_DIRECTORIES = new Set(['actions', 'contract', 'domain', 'engine', 'events', 'moor', 'parents', 'seasons', 'session', 'utils'])

export type NativeCardSourceAdmission =
  | { valid: true; errors: []; cardType: 'minor' | 'occupation'; meta: Record<string, unknown> }
  | { valid: false; errors: string[] }

const definerOf = (call: ts.Expression): keyof typeof DEFINERS | undefined => {
  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return undefined
  return call.expression.text in DEFINERS ? call.expression.text as keyof typeof DEFINERS : undefined
}

const exportedCards = (file: ts.SourceFile) => file.statements.flatMap(statement =>
  ts.isVariableStatement(statement) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ? statement.declarationList.declarations.flatMap(declaration =>
      ts.isIdentifier(declaration.name) && declaration.initializer && definerOf(declaration.initializer)
        ? [{ name: declaration.name.text, call: declaration.initializer as ts.CallExpression }] : [])
    : [])

/** The exported card's name when the source is a native Card Source module, else undefined. */
export function nativeCardId(source: string): string | undefined {
  return exportedCards(ts.createSourceFile('card.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS))[0]?.name
}

/** Shown for a source in the retired CARD_DEF / CARD_IMPL sandbox format, which nothing runs any more. */
export const LEGACY_CARD_SOURCE_MESSAGE = 'This ability uses the retired CARD_DEF / CARD_IMPL sandbox format. Regenerate it as a Card Source module: export const <CARD_ID> = defineMinorCard({ meta, impl }) or defineOccupationCard({ meta, impl }).'

/** True when the source declares an exported native card rather than the retired sandbox format. */
export function isNativeCardSource(source: string): boolean {
  return nativeCardId(source) !== undefined
}

/** Resolves a relative import written from `shared/cards/community/` to a repository path. */
export function resolveCardImportPath(specifier: string): string | null {
  if (!specifier.startsWith('.')) return null
  const parts: string[] = []
  for (const part of `${CARD_SOURCE_DIRECTORY}/${specifier}`.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') { if (!parts.length) return null; parts.pop() } else parts.push(part)
  }
  const path = parts.join('/')
  if (/(?:^|\/)(?:__tests__|__stubs__|__fixtures__|fixtures)(?:\/|$)/.test(path)) return null
  // Mirrors the browser Worker's module map: engine modules and card helpers, not other cards.
  const [, top, ...rest] = path.split('/')
  if (path.split('/')[0] !== 'shared' || !top) return null
  if (top === 'cards') return rest.length === 1 || ['helpers', 'action'].includes(rest[0]!) ? path : null
  return IMPORTABLE_DIRECTORIES.has(top) && rest.length > 0 ? path : null
}

function staticValue(expr: ts.Expression, constants: Map<string, ts.Expression>, at: string, seen: ReadonlySet<string> = new Set()): unknown {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text
  if (ts.isNumericLiteral(expr)) return Number(expr.text)
  if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(expr.operand)) return -Number(expr.operand.text)
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return true
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return false
  if (expr.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr) || ts.isTypeAssertionExpression(expr)) {
    return staticValue(expr.expression, constants, at, seen)
  }
  if (ts.isIdentifier(expr)) {
    const initializer = constants.get(expr.text)
    if (!initializer || seen.has(expr.text)) throw new Error(`${at}: '${expr.text}' must be a top-level constant with a literal value`)
    return staticValue(initializer, constants, at, new Set([...seen, expr.text]))
  }
  if (ts.isArrayLiteralExpression(expr)) {
    return expr.elements.map((element, index) => {
      if (ts.isSpreadElement(element)) throw new Error(`${at}[${index}]: spread is not statically readable`)
      return staticValue(element, constants, `${at}[${index}]`, seen)
    })
  }
  if (ts.isObjectLiteralExpression(expr)) {
    const value: Record<string, unknown> = {}
    for (const property of expr.properties) {
      if (!ts.isPropertyAssignment(property) || ts.isComputedPropertyName(property.name)) {
        throw new Error(`${at}: only plain properties are statically readable`)
      }
      const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) || ts.isNumericLiteral(property.name)
        ? property.name.text : property.name.getText()
      value[key] = staticValue(property.initializer, constants, `${at}.${key}`, seen)
    }
    return value
  }
  throw new Error(`${at}: must be a literal value (strings, numbers, booleans, arrays and objects)`)
}

export function admitNativeCardSource(source: string, cardId: string): NativeCardSourceAdmission {
  const file = ts.createSourceFile(`${CARD_SOURCE_DIRECTORY}/${cardId}.ts`, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const errors: string[] = []
  const syntax = (file as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? []
  for (const diagnostic of syntax) errors.push(`Syntax error: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`)
  const constants = new Map<string, ts.Expression>()
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (!resolveCardImportPath(statement.moduleSpecifier.text)) {
        errors.push(`Import '${statement.moduleSpecifier.text}' must be a relative path to a shared engine module or card helper, not another card or a test (the file lives at ${CARD_SOURCE_DIRECTORY}/${cardId}.ts)`)
      }
    } else if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) {
      errors.push('Export only the card: export const <CARD_ID> = defineMinorCard(...) or defineOccupationCard(...)')
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) constants.set(declaration.name.text, declaration.initializer)
      }
    }
  }
  const cards = exportedCards(file)
  const exportedNames = file.statements.flatMap(statement => ts.isVariableStatement(statement)
    && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)
    ? statement.declarationList.declarations.map(declaration => declaration.name.getText()) : [])
  if (cards.length !== 1 || exportedNames.length !== 1) {
    errors.push(`Declare exactly one export: export const ${cardId} = defineMinorCard({ meta, impl }) or defineOccupationCard({ meta, impl })`)
    return { valid: false, errors }
  }
  const [card] = cards
  if (card!.name !== cardId) errors.push(`The exported card must be named ${cardId}`)
  const input = card!.call.arguments[0]
  const metaProperty = input && ts.isObjectLiteralExpression(input)
    ? input.properties.find((property): property is ts.PropertyAssignment => ts.isPropertyAssignment(property) && property.name.getText() === 'meta')
    : undefined
  if (!metaProperty) {
    errors.push(`${cardId} must be defined with an object literal { meta, impl }`)
    return { valid: false, errors }
  }
  // Pull-request generation rewrites meta in place, so it is written inline like every built-in card.
  if (!ts.isObjectLiteralExpression(metaProperty.initializer)) {
    errors.push('meta must be written inline as an object literal')
    return { valid: false, errors }
  }
  let meta: Record<string, unknown> | undefined
  try {
    const value = staticValue(metaProperty.initializer, constants, 'meta')
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('meta: must be an object')
    meta = value as Record<string, unknown>
  } catch (error) { errors.push(error instanceof Error ? error.message : String(error)) }
  if (meta) {
    if (meta.id !== cardId) errors.push(`meta.id must be '${cardId}'`)
    if (typeof meta.name !== 'string' || !meta.name.trim()) errors.push('meta.name must be a non-empty string')
    if (meta.deck !== 'community') errors.push("meta.deck must be 'community'")
    if (!Array.isArray(meta.desc) || !meta.desc.every(line => typeof line === 'string')) errors.push('meta.desc must be an array of strings')
  }
  if (errors.length || !meta) return { valid: false, errors }
  return { valid: true, errors: [], cardType: DEFINERS[definerOf(card!.call)!], meta }
}
