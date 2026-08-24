#!/usr/bin/env tsx
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const NON_MAJOR_CARD_ID_RE = /^(?:[A-E]|M)\d+_[A-Z]\w*$/

export type CardImplBoundaryViolation = {
  file: string
  line: number
  cardId: string
  referencedCardId?: string
  kind?: 'cross-card-reference' | 'trailing-live-played-count' | 'listener-mutation'
  message?: string
}

export type CardImplBoundaryResult = {
  violations: CardImplBoundaryViolation[]
  filesChecked: number
  cardSourcesChecked: number
  listenerHandlersChecked: number
  trailingListenerHandlersChecked: number
  scopeErrors: string[]
}

export type CardImplBoundaryExitOptions = {
  warnOnly?: boolean
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
  'defineMinorCard',
  'defineOccupationCard',
  'definePlayerActionCard',
])

const TRAILING_PHASES = new Set(['during', 'immediatelyAfter', 'after'])

function isCardSourceDeclaration(node: ts.Node, cardId: string): boolean {
  if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || node.name.text !== cardId) return false
  const initializer = node.initializer && unwrapExpression(node.initializer)
  return Boolean(
    initializer
    && ts.isCallExpression(initializer)
    && ts.isIdentifier(initializer.expression)
    && CARD_SOURCE_FACTORIES.has(initializer.expression.text),
  )
}

function objectProperty(node: ts.ObjectLiteralExpression, name: string): ts.ObjectLiteralElementLike | undefined {
  return node.properties.find(
    (property) => !ts.isSpreadAssignment(property) && propertyNameText(property.name) === name,
  )
}

function isListenerRegistration(node: ts.ObjectLiteralExpression): boolean {
  return Boolean(objectProperty(node, 'id') && objectProperty(node, 'handler'))
}

function listenerPhases(node: ts.ObjectLiteralExpression): string[] | null {
  const property = objectProperty(node, 'phases')
  if (!property || !ts.isPropertyAssignment(property)) return null
  const initializer = unwrapExpression(property.initializer)
  if (!ts.isArrayLiteralExpression(initializer)) return []
  return initializer.elements.flatMap((element) => {
    const value = unwrapExpression(element as ts.Expression)
    return ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value) ? [value.text] : []
  })
}

type ListenerHandlerNode = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration

function collectNamedFunctions(sourceFile: ts.SourceFile): Map<string, ListenerHandlerNode> {
  const functions = new Map<string, ListenerHandlerNode>()
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node)
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
    ) {
      const initializer = unwrapExpression(node.initializer)
      if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
        functions.set(node.name.text, initializer)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return functions
}

function listenerHandler(
  node: ts.ObjectLiteralExpression,
  namedFunctions: Map<string, ListenerHandlerNode>,
): ListenerHandlerNode | null {
  const property = objectProperty(node, 'handler')
  if (!property) return null
  if (ts.isShorthandPropertyAssignment(property)) return namedFunctions.get(property.name.text) ?? null
  if (!ts.isPropertyAssignment(property)) return null
  const initializer = unwrapExpression(property.initializer)
  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) return initializer
  return ts.isIdentifier(initializer) ? namedFunctions.get(initializer.text) ?? null : null
}

function collectTrailingPlayedCountViolations(
  handler: ListenerHandlerNode,
  sourceFile: ts.SourceFile,
  file: string,
  cardId: string,
): CardImplBoundaryViolation[] {
  const violations: CardImplBoundaryViolation[] = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node)
      && node.name.text === 'length'
      && isPublicPlayedCardListExpression(node.expression)
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
      violations.push({
        file,
        line: line + 1,
        cardId,
        kind: 'trailing-live-played-count',
        message: 'trailing listener reads a live played-card count',
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(handler.body)
  return violations
}

function handlerAuthorityNames(handler: ListenerHandlerNode): Set<string> {
  const names = new Set<string>()
  for (const parameter of handler.parameters) {
    if (ts.isIdentifier(parameter.name)) names.add(parameter.name.text)
  }
  return names
}

function addBindingNames(name: ts.BindingName, names: Set<string>): boolean {
  if (ts.isIdentifier(name)) {
    const size = names.size
    names.add(name.text)
    return names.size !== size
  }
  let changed = false
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) changed = addBindingNames(element.name, names) || changed
  }
  return changed
}

function isAuthorityDerivedExpression(node: ts.Expression, authorityNames: Set<string>): boolean {
  const value = unwrapExpression(node)
  if (ts.isIdentifier(value)) return authorityNames.has(value.text)
  if (
    ts.isBinaryExpression(value)
    && value.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  ) {
    return isAuthorityDerivedExpression(value.left, authorityNames)
      || isAuthorityDerivedExpression(value.right, authorityNames)
  }
  if (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)) {
    return isAuthorityDerivedExpression(value.expression, authorityNames)
  }
  if (ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression)) {
    if (LOCAL_COLLECTION_METHODS.has(value.expression.name.text)) return false
    return isAuthorityDerivedExpression(value.expression.expression, authorityNames)
  }
  if (
    ts.isCallExpression(value)
    && ts.isIdentifier(value.expression)
    && AUTHORITY_RETURN_HELPERS.has(value.expression.text)
  ) {
    return value.arguments.some((argument) => isAuthorityDerivedExpression(argument, authorityNames))
  }
  return false
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment
}

const MUTATING_METHODS = new Set([
  'push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin',
  'set', 'add', 'delete', 'clear',
])

const LOCAL_COLLECTION_METHODS = new Set(['map'])

const AUTHORITY_RETURN_HELPERS = new Set(['fieldTopStack'])

const KNOWN_MUTATOR_HELPERS = new Set([
  'ensureCardState',
  'setCardFlag',
  'writeCardInfobox',
  'writeCardExtraData',
  'queueFutureMeeples',
  'queueFutureMeeplesFlow',
  'occupyActionSpace',
])

function collectImportedMutatorNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause?.namedBindings) continue
    if (!ts.isNamedImports(statement.importClause.namedBindings)) continue
    for (const specifier of statement.importClause.namedBindings.elements) {
      const imported = specifier.propertyName?.text ?? specifier.name.text
      if (KNOWN_MUTATOR_HELPERS.has(imported)) names.add(specifier.name.text)
    }
  }
  return names
}

function collectMutatorWrappers(
  namedFunctions: Map<string, ListenerHandlerNode>,
  mutatorNames: Set<string>,
): Set<string> {
  const wrappers = new Set<string>()
  for (const [name, fn] of namedFunctions) {
    const authorityNames = handlerAuthorityNames(fn)
    collectAuthorityAliases(fn, authorityNames)
    let callsMutator = false
    const visit = (node: ts.Node): void => {
      if (authorityMutationMessage(node, authorityNames, mutatorNames)) callsMutator = true
      if (!callsMutator) ts.forEachChild(node, visit)
    }
    visit(fn.body)
    if (callsMutator) wrappers.add(name)
  }
  return wrappers
}

function authorityMutationMessage(
  node: ts.Node,
  authorityNames: Set<string>,
  mutatorNames: Set<string>,
): string | null {
  if (
    ts.isBinaryExpression(node)
    && isAssignmentOperator(node.operatorToken.kind)
    && isAuthorityDerivedExpression(node.left, authorityNames)
  ) return 'card listener directly assigns authority state'
  if (
    (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
    && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
    && isAuthorityDerivedExpression(node.operand, authorityNames)
  ) return 'card listener updates authority state'
  if (
    ts.isDeleteExpression(node)
    && isAuthorityDerivedExpression(node.expression, authorityNames)
  ) return 'card listener deletes authority state'
  if (
    ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && MUTATING_METHODS.has(node.expression.name.text)
    && isAuthorityDerivedExpression(node.expression.expression, authorityNames)
  ) return `card listener calls mutating method ${node.expression.name.text}`
  if (
    ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && mutatorNames.has(node.expression.text)
    && node.arguments.some((argument) => isAuthorityDerivedExpression(argument, authorityNames))
  ) return `card listener calls mutator helper ${node.expression.text}`
  return null
}

function collectAuthorityAliases(handler: ListenerHandlerNode, authorityNames: Set<string>): void {
  let changed = true
  while (changed) {
    changed = false
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node)
        && node.initializer
        && isAuthorityDerivedExpression(node.initializer, authorityNames)
      ) {
        changed = addBindingNames(node.name, authorityNames) || changed
      }
      if (ts.isForOfStatement(node) && isAuthorityDerivedExpression(node.expression, authorityNames)) {
        const initializer = node.initializer
        if (ts.isVariableDeclarationList(initializer)) {
          for (const declaration of initializer.declarations) {
            changed = addBindingNames(declaration.name, authorityNames) || changed
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(handler.body)
  }
}

function collectListenerMutationViolations(
  handler: ListenerHandlerNode,
  sourceFile: ts.SourceFile,
  file: string,
  cardId: string,
  mutatorNames: Set<string>,
): CardImplBoundaryViolation[] {
  const violations: CardImplBoundaryViolation[] = []
  const authorityNames = handlerAuthorityNames(handler)
  collectAuthorityAliases(handler, authorityNames)
  const report = (node: ts.Node, message: string): void => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    violations.push({ file, line: line + 1, cardId, kind: 'listener-mutation', message })
  }
  const visit = (node: ts.Node): void => {
    const message = authorityMutationMessage(node, authorityNames, mutatorNames)
    if (message) report(node, message)
    ts.forEachChild(node, visit)
  }
  visit(handler.body)
  return violations
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

export function checkCardImplBoundaries(files: string[]): CardImplBoundaryResult {
  const violations: CardImplBoundaryViolation[] = []
  let cardSourcesChecked = 0
  let listenerHandlersChecked = 0
  let trailingListenerHandlersChecked = 0
  for (const file of files) {
    const sourceText = fs.readFileSync(file, 'utf8')
    const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const cardId = cardIdFromFile(file)
    const aliases = collectConstCardAliases(sourceFile, cardId)
    const reaches = collectReachCardIds(sourceFile, aliases)
    const namedFunctions = collectNamedFunctions(sourceFile)
    const importedMutators = collectImportedMutatorNames(sourceFile)
    const mutatorNames = new Set([...importedMutators, ...collectMutatorWrappers(namedFunctions, importedMutators)])

    let hasCardSource = false
    const countScope = (node: ts.Node): void => {
      if (isCardSourceDeclaration(node, cardId)) hasCardSource = true
      if (ts.isObjectLiteralExpression(node) && isListenerRegistration(node)) {
        listenerHandlersChecked += 1
        const handler = listenerHandler(node, namedFunctions)
        if (handler) {
          violations.push(...collectListenerMutationViolations(handler, sourceFile, file, cardId, mutatorNames))
        }
        const phases = listenerPhases(node)
        if (phases === null || phases.some((phase) => TRAILING_PHASES.has(phase))) {
          trailingListenerHandlersChecked += 1
          if (handler) {
            violations.push(...collectTrailingPlayedCountViolations(handler, sourceFile, file, cardId))
          }
        }
      }
      ts.forEachChild(node, countScope)
    }
    countScope(sourceFile)
    if (hasCardSource) cardSourcesChecked += 1

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
  const scopeErrors: string[] = []
  if (files.length === 0) scopeErrors.push('no production card files scanned')
  if (files.length > 0 && cardSourcesChecked !== files.length) {
    scopeErrors.push(`found ${cardSourcesChecked} Card Sources for ${files.length} production card files`)
  }
  if (files.length > 0 && listenerHandlersChecked === 0) scopeErrors.push('no card listener handlers scanned')
  if (files.length > 0 && trailingListenerHandlersChecked === 0) {
    scopeErrors.push('no trailing card listener handlers scanned')
  }
  return {
    violations,
    filesChecked: files.length,
    cardSourcesChecked,
    listenerHandlersChecked,
    trailingListenerHandlersChecked,
    scopeErrors,
  }
}

export function walkProductionCardFiles(repoRoot: string): string[] {
  const files: string[] = []
  for (const deck of ['A', 'B', 'C', 'D', 'E', 'M']) {
    const dir = path.join(repoRoot, 'shared', 'cards', deck)
    if (!fs.existsSync(dir)) continue
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (
        entry.isFile()
        && entry.name.endsWith('.ts')
        && !entry.name.endsWith('.test.ts')
        && NON_MAJOR_CARD_ID_RE.test(path.basename(entry.name, '.ts'))
      ) {
        files.push(path.join(dir, entry.name))
      }
    }
  }
  return files
}

if (process.argv[1] && process.argv[1].endsWith('check-card-impl-boundaries.ts')) {
  const repoRoot = path.resolve(__dirname, '..')
  const warnOnly = process.argv.includes('--warn-only')
  const result = checkCardImplBoundaries(walkProductionCardFiles(repoRoot))
  if (result.scopeErrors.length > 0) {
    console.warn('[check-card-impl-boundaries] invalid scan scope:')
    for (const error of result.scopeErrors) console.warn(`  ${error}`)
    process.exit(1)
  }
  if (result.violations.length === 0) {
    console.log(
      `[check-card-impl-boundaries] checked ${result.filesChecked} Card Sources, `
      + `${result.listenerHandlersChecked} listeners, ${result.trailingListenerHandlersChecked} trailing listeners; `
      + 'no boundary violations found',
    )
    process.exit(0)
  }

  console.warn(`[check-card-impl-boundaries] ${result.violations.length} boundary violation(s):`)
  for (const violation of result.violations.slice(0, 30)) {
    console.warn(
      `  ${path.relative(repoRoot, violation.file)}:${violation.line} ${violation.cardId}: ${violation.message}`,
    )
  }
  if (warnOnly) console.warn('[check-card-impl-boundaries] warn-only mode enabled')
  process.exit(cardImplBoundaryExitCode(result, { warnOnly }))
}
