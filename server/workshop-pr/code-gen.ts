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

function usesAnyType(source: string): boolean {
  const sf = ts.createSourceFile('x.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const visit = (node: ts.Node): boolean =>
    node.kind === ts.SyntaxKind.AnyKeyword || (ts.forEachChild(node, visit) ?? false)
  return visit(sf)
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
    if (Array.isArray(entry.rules) && entry.rules.length > 0) {
      fields.push(
        factory.createPropertyAssignment(
          'rules',
          factory.createArrayLiteralExpression(
            entry.rules.map((line) => factory.createStringLiteral(line)),
            false,
          ),
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
  opts: { locales?: CardLocales | null; artUrl?: string | null } = {},
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
  const artUrlToInject = opts.artUrl ?? null

  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const { factory } = context
    const syncCardMetaObject = (object: ts.ObjectLiteralExpression) => {
      const filtered: ts.ObjectLiteralElementLike[] = []
      for (const prop of object.properties) {
        if (
          ts.isPropertyAssignment(prop)
          && (propertyNameMatches(prop.name, 'locales') || propertyNameMatches(prop.name, 'artUrl'))
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
      if (artUrlToInject) {
        filtered.push(
          factory.createPropertyAssignment(
            'artUrl',
            factory.createStringLiteral(artUrlToInject),
          ),
        )
      }
      return factory.updateObjectLiteralExpression(object, filtered)
    }
    const visit: ts.Visitor = (node) => {
      if (
        ts.isNewExpression(node)
        && ts.isIdentifier(node.expression)
        && (node.expression.text === 'MinorImprovement' || node.expression.text === 'Occupation')
        && node.arguments?.length === 1
      ) {
        const arg = node.arguments[0]!
        if (ts.isObjectLiteralExpression(arg)) {
          const updatedArg = syncCardMetaObject(arg)
          return ts.visitEachChild(
            factory.updateNewExpression(node, node.expression, node.typeArguments, [updatedArg]),
            visit,
            context,
          )
        }
      }

      if (
        ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && (node.expression.text === 'MinorImprovement' || node.expression.text === 'Occupation')
        && node.arguments.length === 1
      ) {
        const arg = node.arguments[0]!
        if (ts.isObjectLiteralExpression(arg)) {
          const updatedArg = syncCardMetaObject(arg)
          return ts.visitEachChild(
            factory.updateCallExpression(node, node.expression, node.typeArguments, [updatedArg]),
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
            syncCardMetaObject(node.initializer),
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
      if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) {
        if (!node.body) return node
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
        if (ts.isFunctionDeclaration(node)) {
          return factory.updateFunctionDeclaration(
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

  // Third pass: workshop code is untyped sandbox JS, checked at runtime rather
  // than against the engine's types. Emit every untyped parameter as `any`
  // (TS7006 under the upstream strict build, including callbacks on values
  // the sandbox documents loosely such as `context.result?.resourcesGained`),
  // and give top-level helpers an `any` return so a returned `{ type: 'seq' }`
  // literal is not widened to `string` before it reaches a listener's `flow`.
  const helperTypingTransformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const { factory } = context
    const anyType = () => factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)
    const typeParams = (params: ts.NodeArray<ts.ParameterDeclaration>) => params.map((p) =>
      p.type
        ? p
        : factory.updateParameterDeclaration(
            p, p.modifiers, p.dotDotDotToken, p.name, p.questionToken, anyType(), p.initializer,
          ))
    const visit: ts.Visitor = (node) => {
      const visited = ts.visitEachChild(node, visit, context)
      if (ts.isArrowFunction(visited)) {
        return factory.updateArrowFunction(
          visited, visited.modifiers, visited.typeParameters, typeParams(visited.parameters),
          visited.type, visited.equalsGreaterThanToken, visited.body,
        )
      }
      if (ts.isFunctionExpression(visited)) {
        return factory.updateFunctionExpression(
          visited, visited.modifiers, visited.asteriskToken, visited.name, visited.typeParameters,
          typeParams(visited.parameters), visited.type, visited.body,
        )
      }
      if (ts.isFunctionDeclaration(visited)) {
        return factory.updateFunctionDeclaration(
          visited, visited.modifiers, visited.asteriskToken, visited.name, visited.typeParameters,
          typeParams(visited.parameters), visited.type, visited.body,
        )
      }
      if (ts.isMethodDeclaration(visited)) {
        return factory.updateMethodDeclaration(
          visited, visited.modifiers, visited.asteriskToken, visited.name, visited.questionToken,
          visited.typeParameters, typeParams(visited.parameters), visited.type, visited.body,
        )
      }
      return visited
    }
    const withAnyReturn = (expr: ts.Expression): ts.Expression => {
      if (ts.isArrowFunction(expr) && !expr.type) {
        return factory.updateArrowFunction(
          expr, expr.modifiers, expr.typeParameters, expr.parameters,
          anyType(), expr.equalsGreaterThanToken, expr.body,
        )
      }
      if (ts.isFunctionExpression(expr) && !expr.type) {
        return factory.updateFunctionExpression(
          expr, expr.modifiers, expr.asteriskToken, expr.name, expr.typeParameters,
          expr.parameters, anyType(), expr.body,
        )
      }
      return expr
    }
    const typeHelperReturn = (stmt: ts.Statement): ts.Statement => {
      if (!isWorkshopHelperStatement(stmt)) return stmt
      if (ts.isFunctionDeclaration(stmt) && !stmt.type) {
        return factory.updateFunctionDeclaration(
          stmt, stmt.modifiers, stmt.asteriskToken, stmt.name, stmt.typeParameters,
          stmt.parameters, anyType(), stmt.body,
        )
      }
      if (ts.isVariableStatement(stmt)) {
        return factory.updateVariableStatement(
          stmt,
          stmt.modifiers,
          factory.updateVariableDeclarationList(
            stmt.declarationList,
            stmt.declarationList.declarations.map((decl) =>
              decl.initializer
                ? factory.updateVariableDeclaration(
                    decl, decl.name, decl.exclamationToken, decl.type, withAnyReturn(decl.initializer),
                  )
                : decl),
          ),
        )
      }
      return stmt
    }
    return (node) => {
      const typed = ts.visitEachChild(node, visit, context)
      return factory.updateSourceFile(typed, typed.statements.map(typeHelperReturn))
    }
  }

  const result = ts.transform(sf, [transformer, unusedParamsTransformer, helperTypingTransformer])
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

const CARD_BLOCK_NAMES = new Set(['CARD_ID', 'CARD_DEF', 'CARD_IMPL'])

function declaredNames(stmt: ts.Statement): string[] {
  if (
    (ts.isFunctionDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt) || ts.isInterfaceDeclaration(stmt))
    && stmt.name
  ) {
    return [stmt.name.text]
  }
  if (ts.isVariableStatement(stmt)) {
    return stmt.declarationList.declarations.flatMap((decl) =>
      ts.isIdentifier(decl.name) ? [decl.name.text] : [])
  }
  return []
}

/**
 * Top-level constants, functions and types the workshop author defined next
 * to the CARD_ID / CARD_DEF / CARD_IMPL blocks. Top-level expression
 * statements are sandbox-only and never emitted.
 */
function isWorkshopHelperStatement(stmt: ts.Statement): boolean {
  if (
    !ts.isFunctionDeclaration(stmt)
    && !ts.isVariableStatement(stmt)
    && !ts.isTypeAliasDeclaration(stmt)
    && !ts.isInterfaceDeclaration(stmt)
  ) {
    return false
  }
  const names = declaredNames(stmt)
  return names.length > 0 && names.every((name) => !CARD_BLOCK_NAMES.has(name))
}

/** Identifiers a statement reads, excluding property names (`a.name`, `{ name: v }`). */
function referencedNames(stmt: ts.Statement): Set<string> {
  const names = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const parent = node.parent
      const isPropertyName = (ts.isPropertyAccessExpression(parent) && parent.name === node)
        || (ts.isPropertyAssignment(parent) && parent.name === node)
      const isDeclarationName = ts.isVariableDeclaration(parent) && parent.name === node
      if (!isPropertyName && !isDeclarationName) names.add(node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(stmt)
  return names
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

  // Keep only helpers reachable from CARD_IMPL so the upstream build's
  // noUnusedLocals check does not fail on sandbox leftovers.
  const helperByName = new Map<string, ts.Statement>()
  for (const stmt of sf.statements) {
    if (!isWorkshopHelperStatement(stmt)) continue
    for (const name of declaredNames(stmt)) helperByName.set(name, stmt)
  }
  const kept = new Set<ts.Statement>()
  const pending: ts.Statement[] = [cardImpl]
  while (pending.length > 0) {
    for (const name of referencedNames(pending.pop()!)) {
      const helper = helperByName.get(name)
      if (!helper || kept.has(helper)) continue
      kept.add(helper)
      pending.push(helper)
    }
  }

  const stmts = sf.statements.filter((stmt) => stmt === cardId || stmt === cardImpl || kept.has(stmt))
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
  if (
    ts.isCallExpression(initializer)
    && ts.isIdentifier(initializer.expression)
    && (initializer.expression.text === 'MinorImprovement'
      || initializer.expression.text === 'Occupation')
  ) {
    const arg = initializer.arguments[0]
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
  ctx: { githubLogin: string; iso: string; artUrl?: string | null },
): string {
  const locales = readLocalesFromCardJson(wcard.card_json)
  const normalised = normalizeWorkshopEffectCode(wcard.effect_code, wcard.card_id, {
    locales,
    artUrl: ctx.artUrl,
  })
  const cardMetaSource = extractCardMetaSource(normalised)
  const cardImplSource = extractCardImplSource(normalised)
  const implFile = ts.createSourceFile('impl.ts',cardImplSource,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS)
  const metaFile = ts.createSourceFile('meta.ts',`const meta = ${cardMetaSource}`,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS)
  const needsCardId = [...implFile.statements,...metaFile.statements].some(stmt => referencedNames(stmt).has('CARD_ID'))
  const declaration = findTopLevelConst(implFile,'CARD_ID')
  const cardImplWithId = needsCardId
    ? declaration ? cardImplSource : `const CARD_ID = '${wcard.card_id}'\n${cardImplSource}`
    : printStatements(implFile,implFile.statements.filter(stmt => stmt !== declaration))
  const factory = cardSourceFactory(wcard.card_type)

  // Scan the emitted impl, not the raw sandbox source: helpers that were
  // pruned as unreachable must not leave unused imports behind.
  const used = scanUsedHelpers(cardImplWithId)
  const helperImports = Array.from(used)
    .map((h) => HELPER_IMPORTS[h])
    .filter((x): x is string => !!x)
    .sort()
    .join('\n')
  const lintDirective = usesAnyType(cardImplWithId)
    ? '/* eslint-disable @typescript-eslint/no-explicit-any -- workshop helpers are untyped sandbox code */\n\n'
    : ''

  return `// Generated from Open Agricola workshop. Do not hand-edit.
// Workshop card: ${wcard.card_id}
// Author: ${(wcard.author_name ?? 'unknown').replace(/[\r\n]/g, ' ')}${ctx.githubLogin ? ` (github: @${ctx.githubLogin})` : ''}
// Submitted: ${ctx.iso}

${lintDirective}${cardSourceImport(wcard.card_type)}
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
