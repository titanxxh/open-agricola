/**
 * Source audit for card listener results that change costs: each `costs`
 * result needs one matching `costAttribution` entry for its own card.
 * Used by the official card source audit.
 */
import ts from 'typescript'
import { REAL_RESOURCE_KEYS } from '../../contract/resource-keys'

const RESOURCE_KEYS = new Set<string>(REAL_RESOURCE_KEYS)

/** Parentheses and type-only wrappers do not change the value an expression holds. */
function unwrapExpression(input: ts.Expression): ts.Expression {
  let expression = input
  while (
    ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)
  ) expression = expression.expression
  return expression
}

function getStaticStringValue(
  input: ts.Expression,
  constants: Map<string, string>,
): string | undefined {
  const expression = unwrapExpression(input)
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text
  }
  return ts.isIdentifier(expression) ? constants.get(expression.text) : undefined
}

function collectStringConstants(sourceFile: ts.SourceFile): Map<string, string> {
  const constants = new Map<string, string>()
  for (const statement of sourceFile.statements) {
    if (
      !ts.isVariableStatement(statement)
      || (statement.declarationList.flags & ts.NodeFlags.Const) === 0
    ) continue
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name)
        && declaration.initializer
      ) {
        const value = getStaticStringValue(declaration.initializer, constants)
        if (value !== undefined) constants.set(declaration.name.text, value)
      }
    }
  }
  return constants
}

function getStaticPropertyName(
  property: ts.ObjectLiteralElementLike,
  constants: Map<string, string>,
): string | undefined {
  if (!property.name) return undefined
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text
  }
  if (ts.isComputedPropertyName(property.name)) {
    const expression = property.name.expression
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return expression.text
    }
    if (ts.isIdentifier(expression)) return constants.get(expression.text)
  }
  return undefined
}

function hasInspectablePropertyName(
  property: ts.ObjectLiteralElementLike,
  constants: Map<string, string>,
): boolean {
  if (ts.isSpreadAssignment(property)) return false
  if (
    property.name
    && ts.isComputedPropertyName(property.name)
    && !ts.isStringLiteral(property.name.expression)
    && !ts.isNoSubstitutionTemplateLiteral(property.name.expression)
  ) return false
  const name = getStaticPropertyName(property, constants)
  return name !== undefined && name !== '__proto__'
}

function listenerMayComputeCosts(
  listener: ts.ObjectLiteralExpression,
  constants: Map<string, string>,
): boolean {
  const phases = listener.properties.find(
    property => getStaticPropertyName(property, constants) === 'phases',
  )
  if (!phases) return true
  if (!ts.isPropertyAssignment(phases) || !ts.isArrayLiteralExpression(phases.initializer)) return true
  return phases.initializer.elements.some(
    phase => getStaticStringValue(phase, constants) === 'computeCosts',
  )
}

function forEachListenerResultObject(
  sourceFile: ts.SourceFile,
  constants: Map<string, string>,
  callback: (result: ts.ObjectLiteralExpression) => void,
  onUninspectable?: (expression: ts.Node) => void,
): void {
  type Handler = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration | ts.MethodDeclaration
  const findTopLevelHandler = (name: string): Handler | undefined => {
    for (const statement of sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return statement
      if (!ts.isVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name)
          && declaration.name.text === name
          && declaration.initializer
          && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
        ) return declaration.initializer
      }
    }
    return undefined
  }
  const visitResult = (expression: ts.Expression, rejectUninspectable: boolean): void => {
    if (
      ts.isParenthesizedExpression(expression)
      || ts.isAsExpression(expression)
      || ts.isTypeAssertionExpression(expression)
      || ts.isNonNullExpression(expression)
      || ts.isSatisfiesExpression(expression)
    ) {
      visitResult(expression.expression, rejectUninspectable)
    } else if (ts.isConditionalExpression(expression)) {
      visitResult(expression.whenTrue, rejectUninspectable)
      visitResult(expression.whenFalse, rejectUninspectable)
    } else if (ts.isObjectLiteralExpression(expression)) {
      callback(expression)
    } else if (
      rejectUninspectable
      && expression.kind !== ts.SyntaxKind.NullKeyword
      && !(ts.isIdentifier(expression) && expression.text === 'undefined')
      && !ts.isVoidExpression(expression)
    ) {
      onUninspectable?.(expression)
    }
  }
  const inspectHandler = (handler: Handler, rejectUninspectable: boolean): void => {
    if (!handler.body) {
      if (rejectUninspectable) onUninspectable?.(handler)
      return
    }
    if (!ts.isBlock(handler.body)) {
      visitResult(handler.body, rejectUninspectable)
      return
    }
    const visitReturns = (node: ts.Node): void => {
      if (ts.isReturnStatement(node)) {
        if (node.expression) visitResult(node.expression, rejectUninspectable)
        return
      }
      if (ts.isFunctionLike(node)) return
      ts.forEachChild(node, visitReturns)
    }
    ts.forEachChild(handler.body, visitReturns)
  }
  const visit = (node: ts.Node): void => {
    if (
      (ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node))
      && getStaticPropertyName(node, constants) === 'handler'
    ) {
      const rejectUninspectable = ts.isObjectLiteralExpression(node.parent)
        ? listenerMayComputeCosts(node.parent, constants)
        : true
      if (ts.isMethodDeclaration(node)) {
        inspectHandler(node, rejectUninspectable)
      } else if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
        inspectHandler(node.initializer, rejectUninspectable)
      } else if (ts.isIdentifier(node.initializer)) {
        const handler = findTopLevelHandler(node.initializer.text)
        if (handler) inspectHandler(handler, rejectUninspectable)
        else if (rejectUninspectable) onUninspectable?.(node.initializer)
      } else if (rejectUninspectable) {
        onUninspectable?.(node.initializer)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

function findMissingCostAttributionLines(sourceFile: ts.SourceFile): number[] {
  const constants = collectStringConstants(sourceFile)
  const lines: number[] = []
  forEachListenerResultObject(sourceFile, constants, (result) => {
    const names = new Set(result.properties.map(property => getStaticPropertyName(property, constants)))
    if (names.has('costs') && !names.has('costAttribution')) {
      lines.push(sourceFile.getLineAndCharacterOfPosition(result.getStart(sourceFile)).line + 1)
    }
  }, (expression) => {
    lines.push(sourceFile.getLineAndCharacterOfPosition(expression.getStart(sourceFile)).line + 1)
  })
  return lines
}

export function findInvalidCostAttributionLines(source: string): number[] {
  const sourceFile = ts.createSourceFile(
    'card.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  )
  const lines = findMissingCostAttributionLines(sourceFile)
  validateCostAttributionShapes(sourceFile, [], undefined, lines)
  return [...new Set(lines)]
}

function validateCostAttributionShapes(
  sourceFile: ts.SourceFile,
  errors: string[],
  expectedCardId?: string,
  invalidLines?: number[],
): void {
  const constants = collectStringConstants(sourceFile)
  const declaredCardId = constants.get('CARD_ID')
  const propertyValue = (property: ts.ObjectLiteralElementLike): ts.Expression | undefined => {
    if (ts.isPropertyAssignment(property)) return property.initializer
    if (ts.isShorthandPropertyAssignment(property)) return property.name
    return undefined
  }
  const numberLiteralValue = (expression: ts.Expression): number | undefined => {
    if (ts.isNumericLiteral(expression)) return Number(expression.text)
    if (!ts.isPrefixUnaryExpression(expression)
      || (expression.operator !== ts.SyntaxKind.PlusToken && expression.operator !== ts.SyntaxKind.MinusToken)
      || !ts.isNumericLiteral(expression.operand)
    ) return undefined
    const value = Number(expression.operand.text)
    return expression.operator === ts.SyntaxKind.MinusToken ? -value : value
  }
  const resourceDelta = (expression: ts.Expression): Record<string, number> | undefined => {
    if (!ts.isObjectLiteralExpression(expression)) return undefined
    const result: Record<string, number> = {}
    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property)) return undefined
      const key = getStaticPropertyName(property, constants)
      const value = numberLiteralValue(property.initializer)
      if (!key || !RESOURCE_KEYS.has(key) || value === undefined || !Number.isFinite(value)) return undefined
      result[key] = value
    }
    return result
  }
  const equalResourceDeltas = (left: Record<string, number>, right: Record<string, number>): boolean => {
    const keys = Object.keys(left)
    return keys.length === Object.keys(right).length
      && keys.every(key => left[key] === right[key])
  }
  const report = (result: ts.ObjectLiteralExpression, message: string): void => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(result.getStart(sourceFile))
    errors.push(`line ${line + 1}: ${message}`)
    invalidLines?.push(line + 1)
  }
  forEachListenerResultObject(sourceFile, constants, (result) => {
    const costsProperties = result.properties.filter(
      property => getStaticPropertyName(property, constants) === 'costs',
    )
    const attributionProperties = result.properties.filter(
      property => getStaticPropertyName(property, constants) === 'costAttribution',
    )
    const costsProperty = costsProperties[0]
    const attributionProperty = attributionProperties[0]
    if (costsProperties.length > 1 || attributionProperties.length > 1) {
      report(result, 'listener results must not contain duplicate costs or costAttribution')
    } else if (attributionProperty && !costsProperty) {
      report(result, 'listener results with costAttribution must include costs')
    } else if (costsProperty && attributionProperty) {
      const costs = propertyValue(costsProperty)
      const attribution = propertyValue(attributionProperty)
      const entry = attribution && ts.isArrayLiteralExpression(attribution)
        && attribution.elements.length === 1
        && ts.isObjectLiteralExpression(attribution.elements[0])
        ? attribution.elements[0]
        : undefined
      const sourceProperties = entry?.properties.filter(
        property => getStaticPropertyName(property, constants) === 'sourceCard',
      ) ?? []
      const entryCostsProperties = entry?.properties.filter(
        property => getStaticPropertyName(property, constants) === 'costs',
      ) ?? []
      const validEntryShape = entry
        && entry.properties.every(property => hasInspectablePropertyName(property, constants))
        && sourceProperties.length === 1
        && entryCostsProperties.length === 1
      const sourceProperty = sourceProperties[0]
      const entryCostsProperty = entryCostsProperties[0]
      const source = sourceProperty && propertyValue(sourceProperty)
      const entryCosts = entryCostsProperty && propertyValue(entryCostsProperty)
      const costsDelta = costs && resourceDelta(costs)
      const entryCostsDelta = entryCosts && resourceDelta(entryCosts)
      const sharedDynamicDelta = costs
        && entryCosts
        && ts.isIdentifier(costs)
        && ts.isIdentifier(entryCosts)
        && costs.text === entryCosts.text
      const matchingCosts = sharedDynamicDelta || (
        costsDelta !== undefined
        && entryCostsDelta !== undefined
        && equalResourceDeltas(costsDelta, entryCostsDelta)
      )
      const validSource = source
        && ts.isIdentifier(source)
        && source.text === 'CARD_ID'
        && declaredCardId !== undefined
        && declaredCardId.length > 0
        && (expectedCardId === undefined || declaredCardId === expectedCardId)
      if (
        !entry
        || !validEntryShape
        || !validSource
        || !matchingCosts
      ) {
        report(result, 'costAttribution must contain one matching source entry')
      }
    }
  })
}
