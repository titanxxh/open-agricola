#!/usr/bin/env tsx
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { walkSourceFiles, parseSource } from './source-files'
import { isTestFile } from './architecture-policy.mjs'
import { collectListenerMutationFindings, parseListenerFunction } from './listener-mutation-scan'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const NON_MAJOR_CARD_ID_RE = /^(?:[A-E]|M)\d+_[A-Z]\w*$/

export type CardImplBoundaryViolation = {
  file: string
  line?: number
  cardId: string
  referencedCardId?: string
  kind?: 'cross-card-reference' | 'trailing-live-played-count' | 'direct-field-storage' | 'listener-state-mutation'
  message?: string
}

const FARMYARD_FIELD_OWNER = path.join('shared', 'cards', 'helpers', 'card-field.ts')

const isFarmyardFieldOwner = (file: string): boolean => {
  const normalized = path.normalize(file)
  return normalized === FARMYARD_FIELD_OWNER || normalized.endsWith(`${path.sep}${FARMYARD_FIELD_OWNER}`)
}

const isFieldsAccess = (node: ts.Node): node is ts.PropertyAccessExpression | ts.ElementAccessExpression => {
  if (ts.isPropertyAccessExpression(node)) return node.name.text === 'fields'
  if (!ts.isElementAccessExpression(node) || !node.argumentExpression) return false
  const argument = unwrapExpression(node.argumentExpression)
  return (
    ts.isStringLiteral(argument)
    || ts.isNoSubstitutionTemplateLiteral(argument)
  ) && argument.text === 'fields'
}

export function checkFieldStorageBoundaries(files: string[]): CardImplBoundaryViolation[] {
  const violations: CardImplBoundaryViolation[] = []
  for (const file of files) {
    if (isFarmyardFieldOwner(file)) continue
    const sourceFile = parseSource(file)
    const visit = (node: ts.Node): void => {
      if (isFieldsAccess(node)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        violations.push({
          file,
          line: line + 1,
          cardId: cardIdFromFile(file),
          kind: 'direct-field-storage',
          message: 'direct fields access bypasses the Logical/Farmyard Field boundary',
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  return violations
}

export type CardImplBoundaryResult = {
  violations: CardImplBoundaryViolation[]
  filesChecked: number
  cardSourcesChecked: number
  listenerHandlersChecked: number
  trailingListenerHandlersChecked: number
  listenerFunctionsMutationScanned: number
  scopeErrors: string[]
}

export type CardImplBoundaryExitOptions = {
  warnOnly?: boolean
}

export type RuntimeCardImpl = {
  cardId: string
  file: string
  listeners?: readonly {
    id: string
    phases?: readonly string[]
    handler?: unknown
    deriveCardCostCandidate?: unknown
  }[]
}

export function cardImplBoundaryExitCode(
  result: CardImplBoundaryResult,
  options: CardImplBoundaryExitOptions = {},
): 0 | 1 {
  if (result.scopeErrors.length > 0) return 1
  if (result.violations.length === 0) return 0
  return options.warnOnly ? 0 : 1
}

function cardIdFromFile(file: string): string {
  return path.basename(file, '.ts')
}

function isForbiddenReference(cardId: string, referencedCardId: string): boolean {
  if (!NON_MAJOR_CARD_ID_RE.test(referencedCardId)) return false
  return referencedCardId !== cardId
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return null
}

const CARD_SOURCE_FACTORIES = new Set([
  'defineMajorCard',
  'defineMinorCard',
  'defineOccupationCard',
  'definePlayerActionCard',
])

const TRAILING_PHASES = new Set(['during', 'immediatelyAfter', 'after'])

function cardSourceDeclarationCall(node: ts.Node, cardId: string): ts.CallExpression | null {
  if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || node.name.text !== cardId) return null
  const initializer = node.initializer && unwrapExpression(node.initializer)
  return (
    initializer
    && ts.isCallExpression(initializer)
    && ts.isIdentifier(initializer.expression)
    && CARD_SOURCE_FACTORIES.has(initializer.expression.text)
  ) ? initializer : null
}

function isCardSourceDeclaration(node: ts.Node, cardId: string): boolean {
  return cardSourceDeclarationCall(node, cardId) !== null
}

function isCardImplSourceDeclaration(node: ts.Node, cardId: string): boolean {
  const call = cardSourceDeclarationCall(node, cardId)
  const config = call?.arguments[0] && unwrapExpression(call.arguments[0])
  return Boolean(
    config
    && ts.isObjectLiteralExpression(config)
    && config.properties.some((property) =>
      !ts.isSpreadAssignment(property) && propertyNameText(property.name) === 'impl',
    ),
  )
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  let cur = node
  while (
    ts.isAsExpression(cur) ||
    ts.isSatisfiesExpression(cur) ||
    ts.isTypeAssertionExpression(cur) ||
    ts.isParenthesizedExpression(cur) ||
    ts.isNonNullExpression(cur)
  ) {
    cur = cur.expression
  }
  return cur
}

function isAllowedPropertyName(name: string): boolean {
  if (name === 'reaches' || name === 'allowedPurchases') return true
  const lower = name.toLowerCase()
  return lower.includes('prerequisite') && lower.includes('candidate')
}

function isInsideAllowedProperty(node: ts.Node): boolean {
  let cur: ts.Node | undefined = node.parent
  while (cur) {
    if (ts.isPropertyAssignment(cur)) {
      const name = propertyNameText(cur.name)
      if (name && isAllowedPropertyName(name)) return true
    }
    cur = cur.parent
  }
  return false
}

function isInsideConstAliasDeclaration(node: ts.Node, aliases: Map<string, string[]>): boolean {
  let cur: ts.Node | undefined = node.parent
  while (cur) {
    if (ts.isVariableDeclaration(cur)) {
      return ts.isIdentifier(cur.name) && aliases.has(cur.name.text)
    }
    cur = cur.parent
  }
  return false
}

function isAliasDeclarationName(node: ts.Identifier, aliases: Map<string, string[]>): boolean {
  return ts.isVariableDeclaration(node.parent) && node.parent.name === node && aliases.has(node.text)
}

function collectConstCardAliases(sourceFile: ts.SourceFile, cardId: string): Map<string, string[]> {
  const aliases = new Map<string, string[]>()
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
      const initializer = unwrapExpression(declaration.initializer)
      if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
        if (isForbiddenReference(cardId, initializer.text)) aliases.set(declaration.name.text, [initializer.text])
      } else if (ts.isArrayLiteralExpression(initializer)) {
        const referencedCardIds = initializer.elements
          .map((element) => unwrapExpression(element as ts.Expression))
          .filter((element): element is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral =>
            ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element),
          )
          .map((element) => element.text)
          .filter((value) => isForbiddenReference(cardId, value))
        if (referencedCardIds.length > 0) aliases.set(declaration.name.text, referencedCardIds)
      }
    }
  }
  return aliases
}

function cardIdsFromExpression(expr: ts.Expression, aliases: Map<string, string[]>): string[] {
  const value = unwrapExpression(expr)
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return [value.text]
  if (ts.isIdentifier(value)) return aliases.get(value.text) ?? []
  if (ts.isArrayLiteralExpression(value)) {
    return value.elements.flatMap((element) => cardIdsFromExpression(element as ts.Expression, aliases))
  }
  return []
}

function collectReachCardIds(sourceFile: ts.SourceFile, aliases: Map<string, string[]>): Set<string> {
  const reaches = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && propertyNameText(node.name) === 'reaches') {
      for (const cardId of cardIdsFromExpression(node.initializer, aliases)) reaches.add(cardId)
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return reaches
}

function propertyAccessName(node: ts.Expression): string | null {
  const value = unwrapExpression(node)
  if (ts.isPropertyAccessExpression(value)) return value.name.text
  if (ts.isElementAccessExpression(value)) {
    const arg = value.argumentExpression && unwrapExpression(value.argumentExpression)
    if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) return arg.text
  }
  return null
}

function isPublicPlayedCardListExpression(node: ts.Expression): boolean {
  const name = propertyAccessName(node)
  return name === 'improvements' || name === 'minorPlayed' || name === 'occupationPlayed'
}

function parseRuntimeHandler(handler: unknown, file: string): ts.SourceFile | null {
  const source = Function.prototype.toString.call(handler)
  for (const text of [`const handler = (${source})`, `const holder = { ${source} }`]) {
    const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const diagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] })
      .parseDiagnostics ?? []
    if (diagnostics.length === 0) return sourceFile
  }
  return null
}

function collectTrailingPlayedCountViolations(
  handler: unknown,
  file: string,
  cardId: string,
  listenerId: string,
): CardImplBoundaryViolation[] | null {
  const sourceFile = parseRuntimeHandler(handler, file)
  if (!sourceFile) return null
  const violations: CardImplBoundaryViolation[] = []
  const visit = (node: ts.Node): void => {
    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      && propertyAccessName(node) === 'length'
      && isPublicPlayedCardListExpression(node.expression)
    ) {
      violations.push({
        file,
        cardId,
        kind: 'trailing-live-played-count',
        message: `trailing listener ${listenerId} reads a live played-card count`,
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return violations
}

function collectListenerStateMutationViolations(
  fn: unknown,
  file: string,
  cardId: string,
  listenerId: string,
  role: 'handler' | 'deriveCardCostCandidate',
): CardImplBoundaryViolation[] | null {
  const parsed = parseListenerFunction(fn, file)
  if (!parsed) return null
  return collectListenerMutationFindings(parsed).map((finding) => ({
    file,
    cardId,
    kind: 'listener-state-mutation' as const,
    message: `listener ${listenerId} ${role} writes authoritative state (${finding.kind}): ${finding.text}`,
  }))
}

function isInsidePublicPlayedMembershipCheck(node: ts.Node): boolean {
  let cur: ts.Node | undefined = node.parent
  while (cur) {
    if (
      ts.isCallExpression(cur) &&
      cur.arguments.length > 0 &&
      unwrapExpression(cur.arguments[0] as ts.Expression) === node
    ) {
      const expr = unwrapExpression(cur.expression)
      if (
        ts.isPropertyAccessExpression(expr) &&
        expr.name.text === 'includes' &&
        isPublicPlayedCardListExpression(expr.expression)
      ) {
        return true
      }
    }
    cur = cur.parent
  }
  return false
}

function isAllowedNamedPrintedTargetReference(
  node: ts.Node,
  referencedCardId: string,
  reaches: Set<string>,
): boolean {
  return reaches.has(referencedCardId) && isInsidePublicPlayedMembershipCheck(node)
}

export function checkCardImplBoundaries(
  files: string[],
  runtimeCards?: readonly RuntimeCardImpl[],
): CardImplBoundaryResult {
  const violations: CardImplBoundaryViolation[] = []
  const scopeErrors: string[] = []
  let cardSourcesChecked = 0
  let listenerHandlersChecked = 0
  let trailingListenerHandlersChecked = 0
  let listenerFunctionsMutationScanned = 0
  const cardImplSourceIds = new Set<string>()
  for (const file of files) {
    const sourceFile = parseSource(file)
    const cardId = cardIdFromFile(file)
    const aliases = collectConstCardAliases(sourceFile, cardId)
    const reaches = collectReachCardIds(sourceFile, aliases)

    let sourcesInFile = 0
    const countScope = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const id = node.name.text
        if (isCardSourceDeclaration(node, id)) {
          sourcesInFile += 1
          cardSourcesChecked += 1
        }
        if (isCardImplSourceDeclaration(node, id)) {
          if (cardImplSourceIds.has(id)) scopeErrors.push('duplicate Card Source: ' + id)
          cardImplSourceIds.add(id)
        }
      }
      ts.forEachChild(node, countScope)
    }
    countScope(sourceFile)
    if (sourcesInFile === 0) scopeErrors.push('found 0 Card Sources for 1 production card files')

    const visit = (node: ts.Node): void => {
      if (
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        isForbiddenReference(cardId, node.text) &&
        !isInsideAllowedProperty(node) &&
        !isInsideConstAliasDeclaration(node, aliases) &&
        !isAllowedNamedPrintedTargetReference(node, node.text, reaches)
      ) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        violations.push({
          file,
          line: line + 1,
          cardId,
          referencedCardId: node.text,
          kind: 'cross-card-reference',
          message: `runtime reference to ${node.text}`,
        })
      }
      if (
        ts.isIdentifier(node) &&
        aliases.has(node.text) &&
        !isInsideAllowedProperty(node) &&
        !isAliasDeclarationName(node, aliases)
      ) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        for (const referencedCardId of aliases.get(node.text)!) {
          if (isAllowedNamedPrintedTargetReference(node, referencedCardId, reaches)) continue
          violations.push({
            file,
            line: line + 1,
            cardId,
            referencedCardId,
            kind: 'cross-card-reference',
            message: `runtime reference to ${referencedCardId}`,
          })
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }
  if (files.length === 0) scopeErrors.push('no production card files scanned')
  if (runtimeCards !== undefined) {
    if (runtimeCards.length === 0) scopeErrors.push('no production card implementations scanned')
    const runtimeCardIds = new Set(runtimeCards.map((card) => card.cardId))
    const missingRuntimeCards = [...cardImplSourceIds].filter((cardId) => !runtimeCardIds.has(cardId))
    const unexpectedRuntimeCards = [...runtimeCardIds].filter((cardId) => !cardImplSourceIds.has(cardId))
    if (missingRuntimeCards.length > 0 || unexpectedRuntimeCards.length > 0) {
      scopeErrors.push(
        `runtime Card Impl scope mismatch: missing ${missingRuntimeCards.join(', ') || 'none'}; `
        + `unexpected ${unexpectedRuntimeCards.join(', ') || 'none'}`,
      )
    }
    for (const card of runtimeCards) {
      for (const listener of card.listeners ?? []) {
        for (const [role, fn] of [['handler', listener.handler], ['deriveCardCostCandidate', listener.deriveCardCostCandidate]] as const) {
          if (typeof fn !== 'function') continue
          const mutationViolations = collectListenerStateMutationViolations(fn, card.file, card.cardId, listener.id, role)
          if (!mutationViolations) {
            scopeErrors.push(`cannot parse listener ${role} ${card.cardId}:${listener.id}`)
            continue
          }
          listenerFunctionsMutationScanned += 1
          violations.push(...mutationViolations)
        }
        if (typeof listener.handler !== 'function') continue
        listenerHandlersChecked += 1
        if (listener.phases && !listener.phases.some((phase) => TRAILING_PHASES.has(phase))) continue
        trailingListenerHandlersChecked += 1
        const handlerViolations = collectTrailingPlayedCountViolations(
          listener.handler,
          card.file,
          card.cardId,
          listener.id,
        )
        if (!handlerViolations) {
          scopeErrors.push(`cannot parse trailing listener ${card.cardId}:${listener.id}`)
          continue
        }
        violations.push(...handlerViolations)
      }
    }
    if (runtimeCards.length > 0 && listenerHandlersChecked === 0) {
      scopeErrors.push('no card listener handlers scanned')
    }
    if (runtimeCards.length > 0 && trailingListenerHandlersChecked === 0) {
      scopeErrors.push('no trailing card listener handlers scanned')
    }
    if (runtimeCards.length > 0 && listenerFunctionsMutationScanned === 0) {
      scopeErrors.push('no card listener functions scanned for state mutation')
    }
  }
  return {
    violations,
    filesChecked: files.length,
    cardSourcesChecked,
    listenerHandlersChecked,
    trailingListenerHandlersChecked,
    listenerFunctionsMutationScanned,
    scopeErrors,
  }
}

const cardDirectories = ['A', 'B', 'C', 'D', 'E', 'M', 'major', 'community', 'helpers', '__stubs__']

export function walkProductionCardFiles(repoRoot: string): string[] {
  const cardsRoot = path.join(repoRoot, 'shared/cards')
  for (const directory of cardDirectories) fs.readdirSync(path.join(cardsRoot, directory))
  return walkSourceFiles(cardsRoot).filter(file => {
    if (isTestFile(file)) return false
    const source = parseSource(file)
    let hasSource = false
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isCardSourceDeclaration(node, node.name.text)) hasSource = true
      ts.forEachChild(node, visit)
    }
    visit(source)
    if (hasSource && !file.endsWith('.ts')) throw new Error('unsupported Card Source extension: ' + file)
    return hasSource || NON_MAJOR_CARD_ID_RE.test(cardIdFromFile(file))
  })
}

export function walkProductionFieldBoundaryFiles(repoRoot: string): string[] {
  const cardsRoot = path.join(repoRoot, 'shared/cards')
  for (const directory of cardDirectories) fs.readdirSync(path.join(cardsRoot, directory))
  return walkSourceFiles(cardsRoot).filter(file => !isTestFile(file) && !path.relative(cardsRoot, file).startsWith('__stubs__/'))

}

async function runCli(): Promise<void> {
  const repoRoot = path.resolve(__dirname, '..')
  const warnOnly = process.argv.includes('--warn-only')
  const files = walkProductionCardFiles(repoRoot)
  const fieldBoundaryFiles = walkProductionFieldBoundaryFiles(repoRoot)
  const { ALL_CARD_IMPLS } = await import('../shared/cards/register-all')
  const sourceFilesById = new Map<string, string>()
  for (const file of files) {
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isCardSourceDeclaration(node, node.name.text)) sourceFilesById.set(node.name.text, file)
      ts.forEachChild(node, visit)
    }
    visit(parseSource(file))
  }
  const runtimeCards = Object.entries(ALL_CARD_IMPLS).map(([cardId, impl]): RuntimeCardImpl => ({
    cardId,
    file: sourceFilesById.get(cardId) ?? cardId,
    listeners: impl.listeners?.map((listener) => ({
      id: listener.id,
      phases: listener.phases,
      handler: listener.handler,
      deriveCardCostCandidate: listener.deriveCardCostCandidate,
    })),
  }))
  const result = checkCardImplBoundaries(files, runtimeCards)
  if (fieldBoundaryFiles.length === 0) result.scopeErrors.push('no production field-boundary files scanned')
  result.violations.push(...checkFieldStorageBoundaries(fieldBoundaryFiles))
  if (result.scopeErrors.length > 0) {
    console.warn('[check-card-impl-boundaries] invalid scan scope:')
    for (const error of result.scopeErrors) console.warn(`  ${error}`)
    process.exit(1)
  }
  if (result.violations.length === 0) {
    console.log(
      `[check-card-impl-boundaries] checked ${result.filesChecked} Card Sources, `
      + `${fieldBoundaryFiles.length} field-boundary files, ${result.listenerHandlersChecked} listeners, `
      + `${result.trailingListenerHandlersChecked} trailing listeners, `
      + `${result.listenerFunctionsMutationScanned} listener functions for state mutation; `
      + 'no boundary violations found',
    )
    process.exit(0)
  }

  console.warn(`[check-card-impl-boundaries] ${result.violations.length} boundary violation(s):`)
  for (const violation of result.violations.slice(0, 30)) {
    const file = path.relative(repoRoot, violation.file)
    const location = violation.line === undefined ? file : `${file}:${violation.line}`
    console.warn(
      `  ${location} ${violation.cardId}: ${violation.message}`,
    )
  }
  if (warnOnly) console.warn('[check-card-impl-boundaries] warn-only mode enabled')
  process.exit(cardImplBoundaryExitCode(result, { warnOnly }))
}

if (process.argv[1] && process.argv[1].endsWith('check-card-impl-boundaries.ts')) {
  void runCli().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
