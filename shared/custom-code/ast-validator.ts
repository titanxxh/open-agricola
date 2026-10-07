/**
 * TypeScript AST validator for custom card code.
 *
 * Parses user-submitted TypeScript, walks the AST, and rejects any
 * construct that could escape the sandbox (imports, eval, process, etc.).
 *
 * NOTE: This validator is defense-in-depth — it provides helpful error
 * messages for users. The actual security boundary is isolated-vm
 * (separate V8 heap, no prototype chain escapes possible).
 */
import ts from 'typescript'
import { cardEffectHooks, flowCardEffectHooks, isHandCardEffectHook } from '../cards/card-effects'
import { REAL_RESOURCE_KEYS } from '../contract/resource-keys'
import { isSandboxListenerAction } from './sandbox-listener-actions'
import { sandboxListenerPhases } from './sandbox-listener-phases'

export type ValidationResult = { valid: true } | { valid: false; errors: string[] }

/** Identifiers that are completely forbidden as references. */
const DENIED_IDENTIFIERS = new Set([
  // Sandbox escapes
  'eval', 'Function', 'process', 'require', 'globalThis', 'global',
  'window', 'document', '__dirname', '__filename',
  // Worker globals — reachable in the browser-local executor (which runs card
  // code with new Function, not an isolate); block the self/importScripts path
  // to fetch/IndexedDB/postMessage with same-origin privileges.
  'self', 'importScripts', 'postMessage', 'WorkerGlobalScope', 'indexedDB',
  // Network / IO
  'fetch', 'XMLHttpRequest', 'WebSocket',
  // Timers (not available in sandbox)
  'setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval',
  // Alternative runtimes
  'Deno', 'Bun',
  // Prototype chain manipulation (primary VM escape vector)
  'Proxy', 'Reflect',
])

/** Property names that are forbidden even in property access (obj.constructor). */
const DENIED_PROPERTY_ACCESS = new Set([
  'constructor',
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
])

/** Allowed keys on CARD_IMPL.effect (hook names + meta fields). */
const ALLOWED_EFFECT_KEYS = new Set<string>([
  ...cardEffectHooks,
  'id',
  'handHooks',
  'beforeEndGameScope',
  'beforeEndGameMandatory',
])

/** Allowed values inside listener.phases arrays. */
const ALLOWED_LISTENER_PHASES = new Set<string>(sandboxListenerPhases)
const RESOURCE_KEYS = new Set<string>(REAL_RESOURCE_KEYS)
const FLOW_EFFECT_KEYS = new Set<string>([...flowCardEffectHooks, 'resolveChoice'])

/** Check known literal flow results without treating arbitrary card data as flow
 * or claiming to type-check dynamic helper calls/children. */
function validateLiteralFlow(
  expression: ts.Expression,
  errors: string[],
  getLine: (node: ts.Node) => number,
  constants: Map<string, string>,
): void {
  while (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)) expression = expression.expression
  if (ts.isConditionalExpression(expression)) {
    validateLiteralFlow(expression.whenTrue, errors, getLine, constants)
    validateLiteralFlow(expression.whenFalse, errors, getLine, constants)
    return
  }
  if (!ts.isObjectLiteralExpression(expression)) return
  if (expression.properties.some(property => !hasInspectablePropertyName(property, constants))) return
  const properties = [...expression.properties].reverse()
  const type = properties.find(property => getStaticPropertyName(property, constants) === 'type')
  const kind = type && ts.isPropertyAssignment(type) ? getStaticStringValue(type.initializer, constants) : undefined
  if (!kind || !['seq', 'or', 'xor', 'parallel'].includes(kind)) return
  const children = properties.find(property => getStaticPropertyName(property, constants) === 'children')
  const report = () => errors.push(`line ${getLine(expression)}: ActionFlow '${kind}' requires a children array, not items or steps`)
  if (!children) {
    report()
    return
  }
  if (!ts.isPropertyAssignment(children)) return
  let value = children.initializer
  while (ts.isParenthesizedExpression(value) || ts.isAsExpression(value)
    || ts.isTypeAssertionExpression(value) || ts.isNonNullExpression(value)
    || ts.isSatisfiesExpression(value)) value = value.expression
  if (ts.isArrayLiteralExpression(value)) {
    for (const child of value.elements) validateLiteralFlow(child, errors, getLine, constants)
  } else if (ts.isObjectLiteralExpression(value) || ts.isStringLiteralLike(value) || ts.isNumericLiteral(value)
    || [ts.SyntaxKind.NullKeyword, ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(value.kind)) report()
}

function validateFlowHookReturns(
  hook: ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration,
  errors: string[],
  getLine: (node: ts.Node) => number,
  constants: Map<string, string>,
): void {
  if (!hook.body) return
  if (!ts.isBlock(hook.body)) {
    validateLiteralFlow(hook.body, errors, getLine, constants)
    return
  }
  const visit = (node: ts.Node): void => {
    if (ts.isReturnStatement(node)) {
      if (node.expression) validateLiteralFlow(node.expression, errors, getLine, constants)
      return
    }
    if (ts.isFunctionLike(node)) return
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(hook.body, visit)
}

function getStaticStringValue(
  input: ts.Expression,
  constants: Map<string, string>,
): string | undefined {
  let expression = input
  while (
    ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)
  ) expression = expression.expression
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

export function validateCardCode(source: string, expectedCardId?: string): ValidationResult {
  const sourceFile = ts.createSourceFile(
    'card.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  )

  const errors: string[] = []

  function getLine(node: ts.Node): number {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
    return line + 1
  }

  function visit(node: ts.Node): void {
    // Deny import declarations
    if (ts.isImportDeclaration(node)) {
      errors.push(`line ${getLine(node)}: import declarations are not allowed`)
      return
    }

    // Deny export declarations
    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
      errors.push(`line ${getLine(node)}: export declarations are not allowed`)
      return
    }

    // Deny dynamic import (import(...))
    if (node.kind === ts.SyntaxKind.ImportKeyword) {
      errors.push(`line ${getLine(node)}: dynamic import is not allowed`)
      return
    }

    // Deny require() calls
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      errors.push(`line ${getLine(node)}: require() is not allowed`)
      return
    }

    // Check identifier references against deny list
    if (ts.isIdentifier(node)) {
      const parent = node.parent
      const declaration = parent && ts.isVariableDeclaration(parent) && parent.name === node
        ? parent
        : undefined
      const declarationList = declaration?.parent
      const isTopLevelConstDeclaration = declarationList
        && ts.isVariableDeclarationList(declarationList)
        && (declarationList.flags & ts.NodeFlags.Const) !== 0
        && ts.isVariableStatement(declarationList.parent)
        && declarationList.parent.parent === sourceFile
      const isPropertyName = parent && (
        (ts.isPropertyAccessExpression(parent) && parent.name === node)
        || ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === node)
      )
      if (node.text === 'CARD_IMPL') {
        if (declaration && !isTopLevelConstDeclaration) {
          errors.push(`line ${getLine(node)}: CARD_IMPL must be declared as a top-level const`)
        } else if (!isTopLevelConstDeclaration && !isPropertyName) {
          errors.push(`line ${getLine(node)}: CARD_IMPL must not be referenced outside its declaration`)
        }
      }
      const shadowsCardId = node.text === 'CARD_ID' && (
        (declaration && !isTopLevelConstDeclaration)
        || (parent && ts.isParameter(parent) && parent.name === node)
        || (parent && ts.isBindingElement(parent) && parent.name === node)
        || (parent && ts.isFunctionDeclaration(parent) && parent.name === node)
        || (parent && ts.isFunctionExpression(parent) && parent.name === node)
      )
      if (shadowsCardId) {
        errors.push(`line ${getLine(node)}: CARD_ID must not be shadowed`)
      }
      // Skip property access names (obj.process is fine, bare process is not)
      // BUT check DENIED_PROPERTY_ACCESS for dangerous property names
      if (parent && ts.isPropertyAccessExpression(parent) && parent.name === node) {
        if (DENIED_PROPERTY_ACCESS.has(node.text)) {
          errors.push(`line ${getLine(node)}: accessing '.${node.text}' is not allowed`)
        }
      } else if (parent && (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === node) {
        // Object literal key — OK
      } else if (parent && ts.isLabeledStatement(parent) && parent.label === node) {
        // Label — OK
      } else if (parent && ts.isBreakOrContinueStatement(parent) && parent.label === node) {
        // break/continue label — OK
      } else if (DENIED_IDENTIFIERS.has(node.text)) {
        errors.push(`line ${getLine(node)}: '${node.text}' is not allowed`)
      }
    }

    // Deny computed property access with string literals containing denied names
    // e.g., obj['constructor'], obj['__proto__']
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
      if (DENIED_PROPERTY_ACCESS.has(node.argumentExpression.text)) {
        errors.push(`line ${getLine(node)}: accessing ['${node.argumentExpression.text}'] is not allowed`)
      }
    }

    // Deny tagged template expressions that use denied identifiers
    if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && DENIED_IDENTIFIERS.has(node.tag.text)) {
      errors.push(`line ${getLine(node)}: '${node.tag.text}' is not allowed`)
    }

    // Deny class declarations (unnecessary complexity, potential prototype manipulation)
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      errors.push(`line ${getLine(node)}: class declarations are not allowed`)
      return
    }

    // Deny with statements
    if (node.kind === ts.SyntaxKind.WithStatement) {
      errors.push(`line ${getLine(node)}: 'with' statement is not allowed`)
      return
    }

    // Deny generator functions
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.asteriskToken) {
      errors.push(`line ${getLine(node)}: generator functions are not allowed`)
      return
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  // Validate CARD_IMPL hook/listener whitelists
  validateCardImplHooksAndPhases(sourceFile, errors)
  const constants = collectStringConstants(sourceFile)
  forEachListenerResultObject(sourceFile, constants, result => {
    for (const property of result.properties) {
      if (ts.isPropertyAssignment(property) && ['flow', 'alternativeFlow'].includes(getStaticPropertyName(property, constants) ?? '')) {
        validateLiteralFlow(property.initializer, errors, getLine, constants)
      }
    }
  })
  validateCostAttributionShapes(sourceFile, errors, expectedCardId)
  for (const line of findMissingCostAttributionLines(sourceFile)) {
    errors.push(`line ${line}: listener results with costs must include costAttribution`)
  }

  // Also check for syntax errors
  const diagnostics = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      strict: false,
      noEmit: false,
    },
    reportDiagnostics: true,
  }).diagnostics

  if (diagnostics && diagnostics.length > 0) {
    for (const d of diagnostics) {
      const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n')
      const line = d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
        : 0
      errors.push(`line ${line}: ${msg}`)
    }
  }

  if (errors.length === 0) return { valid: true }
  return { valid: false, errors }
}

/**
 * Find the CARD_IMPL variable declaration in the source and validate:
 * 1. effect keys are in the cardEffectHooks whitelist (+ meta fields)
 * 2. listener actions and phases are in their sandbox whitelists
 */
function validateCardImplHooksAndPhases(
  sourceFile: ts.SourceFile,
  errors: string[],
): void {
  const constants = collectStringConstants(sourceFile)
  function getLine(node: ts.Node): number {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
    return line + 1
  }

  // Walk top-level statements to find `const CARD_IMPL = { ... }`
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== 'CARD_IMPL') continue
      if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) {
        errors.push(`line ${getLine(decl)}: CARD_IMPL must be an object literal`)
        continue
      }
      validateCardImplObject(decl.initializer, errors, getLine, constants)
    }
  }
}

function validateCardImplObject(
  obj: ts.ObjectLiteralExpression,
  errors: string[],
  getLine: (node: ts.Node) => number,
  constants: Map<string, string>,
): void {
  for (const prop of obj.properties) {
    if (ts.isSpreadAssignment(prop)) {
      errors.push(`line ${getLine(prop)}: CARD_IMPL must not use spread properties`)
      continue
    }
    if (ts.isComputedPropertyName(prop.name)) {
      errors.push(`line ${getLine(prop)}: CARD_IMPL properties must not use computed names`)
      continue
    }
    const propName = ts.isIdentifier(prop.name)
      ? prop.name.text
      : ts.isStringLiteral(prop.name) ? prop.name.text : undefined
    if (propName === '__proto__') {
      errors.push(`line ${getLine(prop)}: CARD_IMPL properties must not set __proto__`)
      continue
    }
    if (propName === 'effect') {
      if (!ts.isPropertyAssignment(prop) || !ts.isObjectLiteralExpression(prop.initializer)) {
        errors.push(`line ${getLine(prop)}: CARD_IMPL.effect must be an object literal`)
      } else {
        validateEffectKeys(prop.initializer, errors, getLine, constants)
      }
      continue
    }
    if (propName === 'listeners' && !ts.isPropertyAssignment(prop)) {
      errors.push(`line ${getLine(prop)}: CARD_IMPL.listeners must use a property assignment`)
      continue
    }
    if (!ts.isPropertyAssignment(prop)) continue
    if (!propName) continue

    if (propName === 'listeners') {
      if (!ts.isArrayLiteralExpression(prop.initializer)) {
        errors.push(`line ${getLine(prop.initializer)}: CARD_IMPL.listeners must be an array literal`)
      } else {
        validateListenersArray(prop.initializer, errors, getLine, constants)
      }
    }
  }
}

function validateEffectKeys(
  effectObj: ts.ObjectLiteralExpression,
  errors: string[],
  getLine: (node: ts.Node) => number,
  constants: Map<string, string>,
): void {
  for (const prop of effectObj.properties) {
    if (ts.isSpreadAssignment(prop)) {
      errors.push(`line ${getLine(prop)}: CARD_IMPL.effect must not use spread properties`)
      continue
    }
    if (ts.isComputedPropertyName(prop.name)) {
      errors.push(`line ${getLine(prop)}: CARD_IMPL.effect properties must not use computed names`)
      continue
    }
    if (ts.isGetAccessorDeclaration(prop) || ts.isSetAccessorDeclaration(prop)) {
      errors.push(`line ${getLine(prop)}: CARD_IMPL.effect must not use accessors`)
      continue
    }
    if (!ts.isPropertyAssignment(prop) && !ts.isMethodDeclaration(prop) && !ts.isShorthandPropertyAssignment(prop)) continue
    const name = prop.name && ts.isIdentifier(prop.name)
      ? prop.name.text
      : prop.name && ts.isStringLiteral(prop.name) ? prop.name.text : undefined
    if (!name) continue
    if (!ALLOWED_EFFECT_KEYS.has(name)) {
      errors.push(`line ${getLine(prop)}: unknown effect hook '${name}' in CARD_IMPL.effect`)
    }
    if (FLOW_EFFECT_KEYS.has(name)) {
      if (ts.isMethodDeclaration(prop)) validateFlowHookReturns(prop, errors, getLine, constants)
      else if (ts.isPropertyAssignment(prop) && (ts.isArrowFunction(prop.initializer) || ts.isFunctionExpression(prop.initializer))) {
        validateFlowHookReturns(prop.initializer, errors, getLine, constants)
      }
    }
    if (name !== 'handHooks') continue
    if (!ts.isPropertyAssignment(prop) || !ts.isArrayLiteralExpression(prop.initializer)) {
      errors.push(`line ${getLine(prop)}: handHooks must be a string literal array`)
      continue
    }
    for (const hook of prop.initializer.elements) {
      if (!ts.isStringLiteral(hook)) {
        errors.push(`line ${getLine(hook)}: handHooks must contain only string literals`)
      } else if (!isHandCardEffectHook(hook.text)) {
        errors.push(`line ${getLine(hook)}: unsupported hand hook '${hook.text}' in CARD_IMPL.effect`)
      }
    }
  }
}

function validateListenersArray(
  arr: ts.ArrayLiteralExpression,
  errors: string[],
  getLine: (node: ts.Node) => number,
  constants: Map<string, string>,
): void {
  const isInspectableResult = (expression: ts.Expression): boolean => {
    if (
      ts.isParenthesizedExpression(expression)
      || ts.isAsExpression(expression)
      || ts.isTypeAssertionExpression(expression)
      || ts.isNonNullExpression(expression)
      || ts.isSatisfiesExpression(expression)
    ) return isInspectableResult(expression.expression)
    if (
      expression.kind === ts.SyntaxKind.NullKeyword
      || (ts.isIdentifier(expression) && expression.text === 'undefined')
      || ts.isVoidExpression(expression)
    ) return true
    if (ts.isConditionalExpression(expression)) {
      return isInspectableResult(expression.whenTrue)
        && isInspectableResult(expression.whenFalse)
    }
    return ts.isObjectLiteralExpression(expression)
      && expression.properties.every(property => hasInspectablePropertyName(property, constants))
  }

  const validateHandler = (
    handler: ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration,
    inspectResults: boolean,
  ): void => {
    const validateResult = (expression: ts.Expression): void => {
      if (!isInspectableResult(expression)) {
        errors.push(`line ${getLine(expression)}: listener handlers must return statically inspectable objects`)
      }
    }
    if (!handler.body) {
      errors.push(`line ${getLine(handler)}: listener handlers must have a body`)
      return
    }
    if (!inspectResults) return
    if (!ts.isBlock(handler.body)) {
      validateResult(handler.body)
      return
    }
    const visitReturns = (node: ts.Node): void => {
      if (ts.isReturnStatement(node)) {
        if (node.expression) validateResult(node.expression)
        return
      }
      if (ts.isFunctionLike(node)) return
      ts.forEachChild(node, visitReturns)
    }
    ts.forEachChild(handler.body, visitReturns)
  }

  for (const element of arr.elements) {
    if (!ts.isObjectLiteralExpression(element)) {
      errors.push(`line ${getLine(element)}: CARD_IMPL listener entries must be object literals`)
      continue
    }
    const inspectResults = listenerMayComputeCosts(element, constants)
    for (const prop of element.properties) {
      if (ts.isSpreadAssignment(prop)) {
        errors.push(`line ${getLine(prop)}: CARD_IMPL listener entries must not use spread properties`)
        continue
      }
      if (ts.isComputedPropertyName(prop.name)) {
        errors.push(`line ${getLine(prop)}: CARD_IMPL listener properties must not use computed names`)
        continue
      }
      const propName = ts.isIdentifier(prop.name)
        ? prop.name.text
        : ts.isStringLiteral(prop.name) ? prop.name.text : undefined
      if (propName === '__proto__') {
        errors.push(`line ${getLine(prop)}: CARD_IMPL listener properties must not set __proto__`)
        continue
      }
      if ((propName === 'actions' || propName === 'phases') && !ts.isPropertyAssignment(prop)) {
        errors.push(`line ${getLine(prop)}: listener ${propName} must use a property assignment`)
        continue
      }
      if (propName === 'handler') {
        if (ts.isMethodDeclaration(prop)) {
          validateHandler(prop, inspectResults)
        } else if (
          ts.isPropertyAssignment(prop)
          && (ts.isArrowFunction(prop.initializer) || ts.isFunctionExpression(prop.initializer))
        ) {
          validateHandler(prop.initializer, inspectResults)
        } else {
          errors.push(`line ${getLine(prop)}: listener handlers must be inline functions`)
        }
        continue
      }
      if (!ts.isPropertyAssignment(prop)) continue
      if (propName === 'actions') {
        if (!ts.isArrayLiteralExpression(prop.initializer)) {
          errors.push(`line ${getLine(prop.initializer)}: listener actions must be a string literal array`)
          continue
        }
        for (const actionElement of prop.initializer.elements) {
          if (!ts.isStringLiteral(actionElement)) {
            errors.push(`line ${getLine(actionElement)}: listener actions must contain only string literals`)
          } else if (!isSandboxListenerAction(actionElement.text)) {
            errors.push(`line ${getLine(actionElement)}: unknown listener action '${actionElement.text}' in CARD_IMPL.listeners`)
          }
        }
      }
      if (propName === 'phases') {
        if (!ts.isArrayLiteralExpression(prop.initializer)) {
          errors.push(`line ${getLine(prop.initializer)}: listener phases must be a string literal array`)
          continue
        }
        for (const phaseElement of prop.initializer.elements) {
          if (!ts.isStringLiteral(phaseElement)) {
            errors.push(`line ${getLine(phaseElement)}: listener phases must contain only string literals`)
          } else if (!ALLOWED_LISTENER_PHASES.has(phaseElement.text)) {
            errors.push(`line ${getLine(phaseElement)}: unknown listener phase '${phaseElement.text}' in CARD_IMPL.listeners`)
          }
        }
      }
    }
  }
}
