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
  referencedCardId: string
}

export type CardImplBoundaryResult = {
  violations: CardImplBoundaryViolation[]
  filesChecked: number
}

export type CardImplBoundaryExitOptions = {
  warnOnly?: boolean
}

export function cardImplBoundaryExitCode(
  result: CardImplBoundaryResult,
  options: CardImplBoundaryExitOptions = {},
): 0 | 1 {
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

function unwrapExpression(node: ts.Expression): ts.Expression {
  let cur = node
  while (
    ts.isAsExpression(cur) ||
    ts.isSatisfiesExpression(cur) ||
    ts.isTypeAssertionExpression(cur) ||
    ts.isParenthesizedExpression(cur)
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
  for (const file of files) {
    const sourceText = fs.readFileSync(file, 'utf8')
    const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const cardId = cardIdFromFile(file)
    const aliases = collectConstCardAliases(sourceFile, cardId)
    const reaches = collectReachCardIds(sourceFile, aliases)

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
          })
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }
  return { violations, filesChecked: files.length }
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
  if (result.violations.length === 0) {
    console.log(`[check-card-impl-boundaries] checked ${result.filesChecked} files, no boundary violations found`)
    process.exit(0)
  }

  console.warn(`[check-card-impl-boundaries] ${result.violations.length} boundary violation(s):`)
  for (const violation of result.violations.slice(0, 30)) {
    console.warn(
      `  ${path.relative(repoRoot, violation.file)}:${violation.line} ${violation.cardId} -> ${violation.referencedCardId}`,
    )
  }
  if (warnOnly) console.warn('[check-card-impl-boundaries] warn-only mode enabled')
  process.exit(cardImplBoundaryExitCode(result, { warnOnly }))
}
