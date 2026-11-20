/**
 * One-time conversion of Workshop drafts written in the retired
 * `CARD_DEF` / `CARD_IMPL` sandbox format (decision 7 of #1887).
 *
 * This is the normalization pull-request generation applied to those drafts
 * before ADR 0052: sync the card metadata, type the untyped sandbox code,
 * keep only the helpers `CARD_IMPL` reaches and import the injected helpers
 * it uses. Only the legacy-draft migration calls it.
 */
import ts from 'typescript'

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
function scanUsedHelpers(source: string): Set<string> {
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

const HELPER_IMPORTS: Record<string, string> = {
  gainLeaf: `import { gainLeaf } from '../helpers/pay-gain-node'`,
  payLeaf: `import { payLeaf } from '../helpers/pay-gain-node'`,
  spaceHasPlayer: `import { spaceHasPlayer } from '../../domain/space'`,
  positionKey: `import { positionKey } from '../../domain/farm'`,
  getCardDefinition: `import { getCardDefinition } from '../catalog'`,
  getCardStack: `import { getCardStack } from '../helpers/card-state'`,
  readCardExtraData: `import { readCardExtraData } from '../helpers/card-state'`,
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

/** Synthesized nodes print from their values; nodes parsed from another file would print from the wrong text. */
function jsonExpression(value: unknown): ts.Expression {
  const { factory } = ts
  if (value === null) return factory.createNull()
  if (typeof value === 'string') return factory.createStringLiteral(value)
  if (typeof value === 'number') return value < 0 ? factory.createPrefixUnaryExpression(ts.SyntaxKind.MinusToken, factory.createNumericLiteral(-value)) : factory.createNumericLiteral(value)
  if (typeof value === 'boolean') return value ? factory.createTrue() : factory.createFalse()
  if (Array.isArray(value)) return factory.createArrayLiteralExpression(value.map(jsonExpression))
  if (typeof value === 'object') return factory.createObjectLiteralExpression(Object.entries(value as Record<string, unknown>)
    .map(([key, entry]) => factory.createPropertyAssignment(/^[A-Za-z_$][\w$]*$/.test(key) ? key : factory.createStringLiteral(key), jsonExpression(entry))))
  throw new Error('Translations must be JSON data')
}

function normalizeWorkshopEffectCode(
  source: string,
  cardId: string,
  opts: { artUrl?: string | null; locales?: Record<string, unknown> | null } = {},
): string {
  const sf = ts.createSourceFile(
    `${cardId}.ts`,
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  )

  const artUrlToInject = opts.artUrl ?? null
  // The draft's saved translations replace any stale copy inside the source.
  const locales = opts.locales
  const localesToInject = locales && Object.keys(locales).length ? () => jsonExpression(locales) : null

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
      if (localesToInject) filtered.push(factory.createPropertyAssignment('locales', localesToInject()))
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

function extractCardImplSource(source: string): string {
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

function extractCardMetaSource(source: string): string {
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

/**
 * Converts a draft in the retired sandbox format to the Card Source module a
 * Workshop draft now holds (ADR 0052). Callers check the result with
 * `admitNativeCardSource`; the conversion throws when CARD_DEF is missing.
 */
export function convertLegacyCardSource(source: string, cardId: string, cardType: 'minor' | 'occupation', options: { locales?: Record<string, unknown> | null } = {}): string {
  // The converted module is the draft's runtime source, so it carries the draft's translations in meta.
  const normalised = normalizeWorkshopEffectCode(source, cardId, { locales: options.locales })
  const cardMetaSource = extractCardMetaSource(normalised)
  const cardImplSource = extractCardImplSource(normalised)
  const implFile = ts.createSourceFile('impl.ts',cardImplSource,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS)
  const metaFile = ts.createSourceFile('meta.ts',`const meta = ${cardMetaSource}`,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS)
  const needsCardId = [...implFile.statements,...metaFile.statements].some(stmt => referencedNames(stmt).has('CARD_ID'))
  const declaration = findTopLevelConst(implFile,'CARD_ID')
  const withoutCardId = implFile.statements.flatMap(stmt => {
    if (stmt !== declaration) return [stmt]
    const remaining = declaration.declarationList.declarations.filter(item => !ts.isIdentifier(item.name) || item.name.text !== 'CARD_ID')
    return remaining.length ? [ts.factory.updateVariableStatement(declaration,declaration.modifiers,
      ts.factory.updateVariableDeclarationList(declaration.declarationList,remaining))] : []
  })
  const cardImplWithId = needsCardId
    ? declaration ? cardImplSource : `const CARD_ID = '${cardId}'\n${cardImplSource}`
    : printStatements(implFile,withoutCardId)
  const factory = cardSourceFactory(cardType)

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

  return `${lintDirective}${cardSourceImport(cardType)}
import type { CardImpl } from '../registry'
${helperImports ? '\n' + helperImports : ''}

${cardImplWithId}

const cardImpl = CARD_IMPL satisfies CardImpl

export const ${cardId} = ${factory}({
  meta: ${cardMetaSource},
  impl: cardImpl,
})
`
}
