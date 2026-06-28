import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const cardsRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(__dirname, '../../..')
const productionDeckDirs = ['A', 'B', 'C', 'D', 'E']
const skippedDirectoryNames = new Set(['__tests__', '__stubs__', 'helpers'])
const resultResourceFields = new Set(['resourcesGained', 'resourcesPaid'])
const extraDataResourceFields = new Set(['resourcesGained', 'resourcesPaid', 'bonusUsed'])

type ParsedSource = {
  relativePath: string
  sourceFile: ts.SourceFile
}

type ResultAliases = {
  context: Set<string>
  result: Set<string>
  extraData: Set<string>
}

type AllowedContextResultUse = {
  reason: string
  expectedContextResultReferences: number
  expectedResultPaths: readonly string[]
}

type ShapeCheck = {
  label: string
  check: (sourceFile: ts.SourceFile) => boolean
}

const allowedContextResultUses = {
  'shared/cards/A/A094_LazySowman.ts': {
    reason: 'computeArgs request kind guard for extra options',
    expectedContextResultReferences: 2,
    expectedResultPaths: ['request', 'request.kind', 'type'],
  },
  'shared/cards/B/B018_GrasslandHarrow.ts': {
    reason: 'after-pay ok guard; resource facts come from state reserve',
    expectedContextResultReferences: 1,
    expectedResultPaths: ['type'],
  },
  'shared/cards/C/C148_MudWallower.ts': {
    reason: 'after-pay ok guard; boar payment facts come from resource.paid events',
    expectedContextResultReferences: 1,
    expectedResultPaths: ['type'],
  },
  'shared/cards/D/D050_ForeignAid.ts': {
    reason: 'computeArgs request options filtering',
    expectedContextResultReferences: 1,
    expectedResultPaths: ['request', 'request.kind', 'request.options', 'request.options.filter', 'type'],
  },
} satisfies Record<string, AllowedContextResultUse>

type AllowedContextResultPath = keyof typeof allowedContextResultUses

function stripComments(source: string): string {
  let output = ''
  let i = 0
  let quote: '"' | "'" | '`' | null = null

  while (i < source.length) {
    const current = source[i]
    const next = source[i + 1]

    if (quote) {
      output += current
      if (current === '\\') {
        output += next ?? ''
        i += 2
        continue
      }
      if (current === quote) quote = null
      i++
      continue
    }

    if (current === '"' || current === "'" || current === '`') {
      quote = current
      output += current
      i++
      continue
    }

    if (current === '/' && next === '*') {
      output += '  '
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        output += source[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < source.length) {
        output += '  '
        i += 2
      }
      continue
    }

    if (current === '/' && next === '/') {
      output += '  '
      i += 2
      while (i < source.length && source[i] !== '\n') {
        output += ' '
        i++
      }
      continue
    }

    output += current
    i++
  }

  return output
}

function parseSource(relativePath: string, source: string): ParsedSource {
  const stripped = stripComments(source)
  return {
    relativePath,
    sourceFile: ts.createSourceFile(relativePath, stripped, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
  }
}

function walkProductionCardFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!skippedDirectoryNames.has(entry.name)) files.push(...walkProductionCardFiles(fullPath))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) files.push(fullPath)
  }

  return files
}

function loadProductionCardSources(): ParsedSource[] {
  return productionDeckDirs
    .flatMap((deck) => walkProductionCardFiles(path.join(cardsRoot, deck)))
    .map((filePath) =>
      parseSource(
        path.relative(repoRoot, filePath).replaceAll(path.sep, '/'),
        readFileSync(filePath, 'utf8'),
      ),
    )
}

function forEachNode(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node)
  ts.forEachChild(node, (child) => forEachNode(child, visit))
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression
  }
  return current
}

function propertyNameText(name: ts.PropertyName | ts.BindingName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  if (ts.isComputedPropertyName(name)) {
    const expression = unwrapExpression(name.expression)
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text
  }
  return undefined
}

function accessPropertyName(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text
  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression ? unwrapExpression(node.argumentExpression) : undefined
    if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) return argument.text
  }
  return undefined
}

function isIdentifierAlias(expression: ts.Expression, aliases: Set<string>): boolean {
  const unwrapped = unwrapExpression(expression)
  return ts.isIdentifier(unwrapped) && aliases.has(unwrapped.text)
}

function isContextExpression(expression: ts.Expression, aliases?: ResultAliases): boolean {
  const unwrapped = unwrapExpression(expression)
  return ts.isIdentifier(unwrapped) && (unwrapped.text === 'context' || aliases?.context.has(unwrapped.text))
}

function fallbackSourceExpression(expression: ts.Expression): ts.Expression {
  const unwrapped = unwrapExpression(expression)
  if (
    ts.isBinaryExpression(unwrapped) &&
    (unwrapped.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      unwrapped.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    return fallbackSourceExpression(unwrapped.left)
  }
  return unwrapped
}

function isContextResultExpression(expression: ts.Expression, aliases: ResultAliases): boolean {
  const unwrapped = unwrapExpression(expression)
  return (
    (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) &&
    accessPropertyName(unwrapped) === 'result' &&
    isContextExpression(unwrapped.expression, aliases)
  )
}

function isResultExpression(expression: ts.Expression, aliases: ResultAliases): boolean {
  return isContextResultExpression(expression, aliases) || isIdentifierAlias(expression, aliases.result)
}

function isExtraDataExpression(expression: ts.Expression, aliases: ResultAliases): boolean {
  const unwrapped = unwrapExpression(expression)
  if (isIdentifierAlias(unwrapped, aliases.extraData)) return true
  return (
    (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) &&
    accessPropertyName(unwrapped) === 'extraData' &&
    isResultExpression(unwrapped.expression, aliases)
  )
}

function addAlias(aliases: Set<string>, name: string): boolean {
  const previousSize = aliases.size
  aliases.add(name)
  return aliases.size !== previousSize
}

function collectResultBindingAliases(pattern: ts.BindingPattern, aliases: ResultAliases): boolean {
  let changed = false

  for (const element of pattern.elements) {
    if (ts.isOmittedExpression(element)) continue
    const propertyName = element.propertyName ? propertyNameText(element.propertyName) : propertyNameText(element.name)
    if (propertyName === 'extraData' && ts.isIdentifier(element.name)) {
      changed = addAlias(aliases.extraData, element.name.text) || changed
    }
  }

  return changed
}

function collectContextBindingAliases(pattern: ts.BindingPattern, aliases: ResultAliases): boolean {
  let changed = false

  for (const element of pattern.elements) {
    if (ts.isOmittedExpression(element)) continue
    const propertyName = element.propertyName ? propertyNameText(element.propertyName) : propertyNameText(element.name)
    if (propertyName !== 'result') continue
    if (ts.isIdentifier(element.name)) {
      changed = addAlias(aliases.result, element.name.text) || changed
    } else if (ts.isObjectBindingPattern(element.name)) {
      changed = collectResultBindingAliases(element.name, aliases) || changed
    }
  }

  return changed
}

function collectBindingAliases(pattern: ts.BindingPattern, initializer: ts.Expression, aliases: ResultAliases): boolean {
  let changed = false
  const initializerIsResult = isResultExpression(initializer, aliases)
  const initializerIsExtraData = isExtraDataExpression(initializer, aliases)
  if (!initializerIsResult && !initializerIsExtraData) return false

  for (const element of pattern.elements) {
    if (ts.isOmittedExpression(element)) continue
    const propertyName = element.propertyName ? propertyNameText(element.propertyName) : propertyNameText(element.name)
    if (initializerIsResult && propertyName === 'extraData' && ts.isIdentifier(element.name)) {
      changed = addAlias(aliases.extraData, element.name.text) || changed
    }
  }

  return changed
}

function parentIsHandlerProperty(node: ts.Node): boolean {
  return (
    ts.isPropertyAssignment(node) &&
    propertyNameText(node.name) === 'handler'
  )
}

function collectContextParameterAliases(node: ts.Node, aliases: ResultAliases): boolean {
  if (!ts.isFunctionLike(node)) return false
  const firstParameter = node.parameters[0]
  if (!firstParameter || !ts.isIdentifier(firstParameter.name)) return false

  const parameterName = firstParameter.name.text
  const typeText = firstParameter.type?.getText()
  if (
    parameterName === 'context' ||
    parameterName === 'ctx' ||
    typeText === 'CardListenerContext' ||
    parentIsHandlerProperty(node.parent)
  ) {
    return addAlias(aliases.context, parameterName)
  }
  return false
}

function collectAliases(sourceFile: ts.SourceFile): ResultAliases {
  const aliases: ResultAliases = { context: new Set(['context']), result: new Set(), extraData: new Set() }
  let changed = true

  while (changed) {
    changed = false
    forEachNode(sourceFile, (node) => {
      changed = collectContextParameterAliases(node, aliases) || changed
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const initializer = fallbackSourceExpression(node.initializer)
        if (ts.isIdentifier(node.name)) {
          if (isResultExpression(initializer, aliases)) changed = addAlias(aliases.result, node.name.text) || changed
          if (isExtraDataExpression(initializer, aliases)) changed = addAlias(aliases.extraData, node.name.text) || changed
        } else if (ts.isObjectBindingPattern(node.name)) {
          if (isContextExpression(initializer, aliases)) changed = collectContextBindingAliases(node.name, aliases) || changed
          changed = collectBindingAliases(node.name, initializer, aliases) || changed
        }
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const left = unwrapExpression(node.left)
        if (!ts.isIdentifier(left)) return
        const right = fallbackSourceExpression(node.right)
        if (isResultExpression(right, aliases)) changed = addAlias(aliases.result, left.text) || changed
        if (isExtraDataExpression(right, aliases)) changed = addAlias(aliases.extraData, left.text) || changed
      }
    })
  }

  return aliases
}

function collectForbiddenBindingReads(
  pattern: ts.BindingPattern,
  initializerKind: 'result' | 'extraData',
  sourceFile: ts.SourceFile,
): string[] {
  const offenders: string[] = []

  for (const element of pattern.elements) {
    if (ts.isOmittedExpression(element)) continue
    const propertyName = element.propertyName ? propertyNameText(element.propertyName) : propertyNameText(element.name)

    if (initializerKind === 'result') {
      if (propertyName && resultResourceFields.has(propertyName)) offenders.push(element.getText(sourceFile))
      if (propertyName === 'extraData' && ts.isObjectBindingPattern(element.name)) {
        offenders.push(...collectForbiddenBindingReads(element.name, 'extraData', sourceFile))
      }
      continue
    }

    if (propertyName && extraDataResourceFields.has(propertyName)) offenders.push(element.getText(sourceFile))
  }

  return offenders
}

function collectForbiddenContextBindingReads(pattern: ts.BindingPattern, sourceFile: ts.SourceFile): string[] {
  const offenders: string[] = []

  for (const element of pattern.elements) {
    if (ts.isOmittedExpression(element)) continue
    const propertyName = element.propertyName ? propertyNameText(element.propertyName) : propertyNameText(element.name)
    if (propertyName === 'result' && ts.isObjectBindingPattern(element.name)) {
      offenders.push(...collectForbiddenBindingReads(element.name, 'result', sourceFile))
    }
  }

  return offenders
}

function collectForbiddenReads(parsed: ParsedSource): string[] {
  const aliases = collectAliases(parsed.sourceFile)
  const offenders = new Set<string>()

  forEachNode(parsed.sourceFile, (node) => {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const propertyName = accessPropertyName(node)
      if (
        ts.isElementAccessExpression(node) &&
        propertyName === undefined &&
        (isResultExpression(node.expression, aliases) || isExtraDataExpression(node.expression, aliases))
      ) {
        offenders.add(node.getText(parsed.sourceFile))
      }
      if (propertyName && resultResourceFields.has(propertyName) && isResultExpression(node.expression, aliases)) {
        offenders.add(node.getText(parsed.sourceFile))
      }
      if (propertyName && extraDataResourceFields.has(propertyName) && isExtraDataExpression(node.expression, aliases)) {
        offenders.add(node.getText(parsed.sourceFile))
      }
    }

    if (ts.isVariableDeclaration(node) && node.initializer && ts.isObjectBindingPattern(node.name)) {
      const initializer = fallbackSourceExpression(node.initializer)
      if (isContextExpression(initializer, aliases)) {
        collectForbiddenContextBindingReads(node.name, parsed.sourceFile).forEach((offender) => offenders.add(offender))
      }
      if (isResultExpression(initializer, aliases)) {
        collectForbiddenBindingReads(node.name, 'result', parsed.sourceFile).forEach((offender) => offenders.add(offender))
      }
      if (isExtraDataExpression(initializer, aliases)) {
        collectForbiddenBindingReads(node.name, 'extraData', parsed.sourceFile).forEach((offender) => offenders.add(offender))
      }
    }
  })

  return [...offenders].sort()
}

function resultPathFor(expression: ts.Expression, aliases: ResultAliases): string[] | undefined {
  const unwrapped = unwrapExpression(expression)
  if (isContextResultExpression(unwrapped, aliases) || isIdentifierAlias(unwrapped, aliases.result)) return []
  if (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) {
    const basePath = resultPathFor(unwrapped.expression, aliases)
    const propertyName = accessPropertyName(unwrapped)
    if (basePath && propertyName) return [...basePath, propertyName]
  }
  return undefined
}

function collectResultPaths(sourceFile: ts.SourceFile): string[] {
  const aliases = collectAliases(sourceFile)
  const paths = new Set<string>()

  forEachNode(sourceFile, (node) => {
    if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return
    const resultPath = resultPathFor(node, aliases)
    if (resultPath && resultPath.length > 0) paths.add(resultPath.join('.'))
  })

  return [...paths].sort()
}

function countContextResultBindingReferences(pattern: ts.BindingPattern): number {
  return pattern.elements.filter((element) => {
    if (ts.isOmittedExpression(element)) return false
    const propertyName = element.propertyName ? propertyNameText(element.propertyName) : propertyNameText(element.name)
    return propertyName === 'result'
  }).length
}

function countContextResultReferences(sourceFile: ts.SourceFile): number {
  const aliases = collectAliases(sourceFile)
  let count = 0
  forEachNode(sourceFile, (node) => {
    if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && isContextResultExpression(node, aliases)) {
      count++
    }
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isObjectBindingPattern(node.name)) {
      const initializer = fallbackSourceExpression(node.initializer)
      if (isContextExpression(initializer, aliases)) count += countContextResultBindingReferences(node.name)
    }
  })
  return count
}

function stringLiteralText(expression: ts.Expression): string | undefined {
  const unwrapped = unwrapExpression(expression)
  if (ts.isStringLiteral(unwrapped) || ts.isNoSubstitutionTemplateLiteral(unwrapped)) return unwrapped.text
  return undefined
}

function hasResultStringComparison(
  sourceFile: ts.SourceFile,
  path: string,
  operatorKind: ts.SyntaxKind,
  value: string,
): boolean {
  const aliases = collectAliases(sourceFile)
  let found = false

  forEachNode(sourceFile, (node) => {
    if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== operatorKind) return
    const leftPath = resultPathFor(node.left, aliases)?.join('.')
    if (leftPath === path && stringLiteralText(node.right) === value) found = true
  })

  return found
}

function hasResultPathAssignment(sourceFile: ts.SourceFile, path: string): boolean {
  const aliases = collectAliases(sourceFile)
  let found = false

  forEachNode(sourceFile, (node) => {
    if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return
    const leftPath = resultPathFor(node.left, aliases)?.join('.')
    if (leftPath === path) found = true
  })

  return found
}

function hasContextSourceCardGuard(sourceFile: ts.SourceFile): boolean {
  const aliases = collectAliases(sourceFile)
  let found = false

  forEachNode(sourceFile, (node) => {
    if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.ExclamationEqualsEqualsToken) return
    const left = unwrapExpression(node.left)
    const right = unwrapExpression(node.right)
    if (
      (ts.isPropertyAccessExpression(left) || ts.isElementAccessExpression(left)) &&
      accessPropertyName(left) === 'sourceCard' &&
      isContextExpression(left.expression, aliases) &&
      ts.isIdentifier(right) &&
      right.text === 'CARD_ID'
    ) {
      found = true
    }
  })

  return found
}

function hasCallWithStringArg(sourceFile: ts.SourceFile, functionName: string, value: string): boolean {
  let found = false

  forEachNode(sourceFile, (node) => {
    if (!ts.isCallExpression(node)) return
    const expression = unwrapExpression(node.expression)
    if (!ts.isIdentifier(expression) || expression.text !== functionName) return
    if (node.arguments.some((argument) => stringLiteralText(argument) === value)) found = true
  })

  return found
}

const requiredShapeChecks = {
  'shared/cards/A/A094_LazySowman.ts': [
    {
      label: 'guards request type',
      check: (sourceFile) =>
        hasResultStringComparison(sourceFile, 'type', ts.SyntaxKind.ExclamationEqualsEqualsToken, 'request'),
    },
    {
      label: 'guards choice request kind',
      check: (sourceFile) =>
        hasResultStringComparison(sourceFile, 'request.kind', ts.SyntaxKind.ExclamationEqualsEqualsToken, 'choice'),
    },
  ],
  'shared/cards/B/B018_GrasslandHarrow.ts': [
    {
      label: 'guards own source card',
      check: hasContextSourceCardGuard,
    },
    {
      label: 'guards ok result',
      check: (sourceFile) =>
        hasResultStringComparison(sourceFile, 'type', ts.SyntaxKind.ExclamationEqualsEqualsToken, 'ok'),
    },
  ],
  'shared/cards/C/C148_MudWallower.ts': [
    {
      label: 'guards ok result',
      check: (sourceFile) =>
        hasResultStringComparison(sourceFile, 'type', ts.SyntaxKind.ExclamationEqualsEqualsToken, 'ok'),
    },
    {
      label: 'uses boar payment provenance',
      check: (sourceFile) => hasCallWithStringArg(sourceFile, 'sumResourcePaid', 'boar'),
    },
  ],
  'shared/cards/D/D050_ForeignAid.ts': [
    {
      label: 'guards request type',
      check: (sourceFile) =>
        hasResultStringComparison(sourceFile, 'type', ts.SyntaxKind.EqualsEqualsEqualsToken, 'request'),
    },
    {
      label: 'guards choice request kind',
      check: (sourceFile) =>
        hasResultStringComparison(sourceFile, 'request.kind', ts.SyntaxKind.EqualsEqualsEqualsToken, 'choice'),
    },
    {
      label: 'filters request options',
      check: (sourceFile) => hasResultPathAssignment(sourceFile, 'request.options') &&
        collectResultPaths(sourceFile).includes('request.options.filter'),
    },
  ],
} satisfies Record<AllowedContextResultPath, readonly ShapeCheck[]>

function sampleForbiddenReads(source: string): string[] {
  return collectForbiddenReads(parseSource('sample.ts', source))
}

describe('production card provenance result audit', () => {
  it('no production card reads forbidden resource facts from context.result/result', () => {
    const offenders = loadProductionCardSources().flatMap((file) =>
      collectForbiddenReads(file).map((offender) => `${file.relativePath}: ${offender}`),
    )

    expect(offenders).toEqual([])
  })

  it('every production context.result use is explicitly allowlisted', () => {
    const actualUses = loadProductionCardSources()
      .filter((file) => countContextResultReferences(file.sourceFile) > 0)
      .map((file) => file.relativePath)
      .sort()

    const allowedUses = Object.keys(allowedContextResultUses).sort()
    const missingReasons = Object.entries(allowedContextResultUses)
      .filter(([, allowed]) => allowed.reason.trim().length === 0)
      .map(([relativePath]) => relativePath)

    expect(missingReasons).toEqual([])
    expect(actualUses).toEqual(allowedUses)
  })

  it('keeps allowlisted context.result uses constrained to documented shapes', () => {
    const files = new Map(loadProductionCardSources().map((file) => [file.relativePath, file]))
    const shapeFailures = Object.entries(allowedContextResultUses).flatMap(([relativePath, allowed]) => {
      const file = files.get(relativePath)
      if (!file) return [`${relativePath}: file missing`]
      const referenceCount = countContextResultReferences(file.sourceFile)
      const referenceFailure = referenceCount === allowed.expectedContextResultReferences
        ? []
        : [`${relativePath}: expected ${allowed.expectedContextResultReferences} context.result references, found ${referenceCount}`]
      const pathFailure = collectResultPaths(file.sourceFile).join(',') === [...allowed.expectedResultPaths].sort().join(',')
        ? []
        : [`${relativePath}: unexpected result paths ${collectResultPaths(file.sourceFile).join(',')}`]
      const shapeFailures = requiredShapeChecks[relativePath as AllowedContextResultPath]
        .filter((shapeCheck) => !shapeCheck.check(file.sourceFile))
        .map((shapeCheck) => `${relativePath}: ${shapeCheck.label}`)
      return [...referenceFailure, ...pathFailure, ...shapeFailures]
    })

    expect(shapeFailures).toEqual([])
  })

  it('ignores forbidden-looking text inside comments and strings while preserving real context.result code', () => {
    const parsed = parseSource('sample.ts', `
      // context.result.extraData.bonusUsed must not be reported from line comments
      /*
       * result?.resourcesGained must not be reported from block comments
       */
      const text = 'context.result.resourcesPaid'
      const ok = context.result?.type === 'ok'
    `)

    expect(collectForbiddenReads(parsed)).toEqual([])
    expect(collectResultPaths(parsed.sourceFile)).toEqual(['type'])
  })

  it('detects direct, bracket, destructured, and aliased resource fallback reads', () => {
    expect(sampleForbiddenReads('context.result.resourcesGained')).not.toEqual([])
    expect(sampleForbiddenReads('context.result?.resourcesPaid')).not.toEqual([])
    expect(sampleForbiddenReads("context.result?.['resourcesPaid']")).not.toEqual([])
    expect(sampleForbiddenReads('context.result.extraData.bonusUsed')).not.toEqual([])
    expect(sampleForbiddenReads("context.result.extraData['bonusUsed']")).not.toEqual([])
    expect(sampleForbiddenReads('context.result?.extraData?.resourcesGained')).not.toEqual([])
    expect(sampleForbiddenReads("const key = 'resourcesPaid'; context.result?.[key]")).not.toEqual([])
    expect(sampleForbiddenReads("const key = 'bonusUsed'; context.result.extraData?.[key]")).not.toEqual([])
    expect(sampleForbiddenReads('const result = context.result; result.resourcesPaid')).not.toEqual([])
    expect(sampleForbiddenReads('const result = context.result; result?.extraData?.bonusUsed')).not.toEqual([])
    expect(sampleForbiddenReads('const result = context.result ?? {}; result.resourcesPaid')).not.toEqual([])
    expect(sampleForbiddenReads('const actionResult = context.result; actionResult.resourcesPaid')).not.toEqual([])
    expect(sampleForbiddenReads('const actionResult = context.result; actionResult.extraData.bonusUsed')).not.toEqual([])
    expect(sampleForbiddenReads('const actionResult = context.result || {}; actionResult.extraData.bonusUsed')).not.toEqual([])
    expect(sampleForbiddenReads('const handler = { handler: (ctx) => ctx.result?.resourcesPaid }')).not.toEqual([])
    expect(sampleForbiddenReads('const handler = { handler: (ctx) => { const result = ctx.result; return result.resourcesPaid } }')).not.toEqual([])
    expect(sampleForbiddenReads('const fn = (ctx: CardListenerContext) => ctx.result?.resourcesPaid')).not.toEqual([])
    expect(sampleForbiddenReads('const { result } = context; result.resourcesPaid')).not.toEqual([])
    expect(sampleForbiddenReads('const { result: actionResult } = context; actionResult.resourcesPaid')).not.toEqual([])
    expect(sampleForbiddenReads('const { result: { resourcesPaid } } = context')).not.toEqual([])
    expect(sampleForbiddenReads('const { resourcesPaid } = context.result')).not.toEqual([])
    expect(sampleForbiddenReads('const { bonusUsed } = context.result.extraData')).not.toEqual([])
    expect(sampleForbiddenReads('const { extraData } = context.result; extraData.bonusUsed')).not.toEqual([])
    expect(sampleForbiddenReads('const { extraData: data } = context.result; data.bonusUsed')).not.toEqual([])
    expect(sampleForbiddenReads('const { extraData: { bonusUsed } } = context.result')).not.toEqual([])
    expect(sampleForbiddenReads('const extraData = context.result.extraData; extraData.bonusUsed')).not.toEqual([])
    expect(sampleForbiddenReads('const extraData = context.result?.extraData ?? {}; extraData.bonusUsed')).not.toEqual([])
    expect(sampleForbiddenReads('const data: unknown = context.result.extraData; data.bonusUsed')).not.toEqual([])
    expect(sampleForbiddenReads('const data = context.result.extraData; const alias = data; alias.bonusUsed')).not.toEqual([])
    expect(sampleForbiddenReads('let alias; const data = context.result.extraData; alias = data; alias.bonusUsed')).not.toEqual([])
  })
})
