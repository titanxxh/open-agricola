#!/usr/bin/env tsx
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { isTestFile, isSourceFile } from './architecture-policy.mjs'
import { parseSource, walkSourceFiles } from './source-files'

export const CARD_STATE_SCAN_ROOTS = [
  'shared/domain', 'shared/actions', 'shared/engine', 'shared/session',
  'shared/projections', 'server', 'client', 'replay-viewer/src',
] as const
export type CardStateBoundaryKind = 'single-card-state' | 'card-prompt-policy' | 'card-storage-import' | 'raw-client-state'
export type CardStateBoundaryFinding = { file: string; line: number; kind: CardStateBoundaryKind; reason: string }
export type CardStateBoundaryException = Pick<CardStateBoundaryFinding, 'file' | 'line' | 'kind'> & { reason: string }
export type CardStateBoundaryResult = { findings: CardStateBoundaryFinding[]; scopeErrors: string[]; filesChecked: number }
const helperNames = new Set([
  'readCardExtraData', 'writeCardExtraData', 'readPrivateCardData', 'writePrivateCardData',
  'initCardState', 'setCardFlag', 'getCardFlag', 'readCardInfobox', 'writeCardInfobox',
  'getCardStack', 'pushToCardStack', 'popFromCardStack', 'incCounter', 'readCardResourceStats',
])
const unwrap = (value: ts.Expression): ts.Expression => {
  while (ts.isParenthesizedExpression(value) || ts.isAsExpression(value) || ts.isSatisfiesExpression(value) || ts.isNonNullExpression(value) || ts.isTypeAssertionExpression(value)) value = value.expression
  return value
}
const member = (node: ts.Node): string | undefined => ts.isPropertyAccessExpression(node) ? node.name.text
  : ts.isElementAccessExpression(node) && node.argumentExpression && (ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression)) ? node.argumentExpression.text : undefined

/** Ordinary constant aliases and container aliases; intentionally not whole-program JS analysis. */
export const scanCardStateSource = (source: ts.SourceFile, file: string, cardPromptKeys: readonly string[], cardNames: readonly string[] = []): CardStateBoundaryFinding[] => {
  const aliases = new Map<string, ts.Expression>()
  const importedHelpers = new Map<string, string>()
  const stateContainers = new Set<string>(['cardStates'])
  const cardValues = new Set<string>()
  const findings: CardStateBoundaryFinding[] = []
  const client = /^(?:client|replay-viewer\/src)\//.test(file)
  const resolve = (value: ts.Expression, seen = new Set<string>()): ts.Expression => {
    value = unwrap(value)
    if (ts.isIdentifier(value) && !seen.has(value.text) && aliases.has(value.text)) {
      seen.add(value.text); return resolve(aliases.get(value.text)!, seen)
    }
    return value
  }
  const literal = (value: ts.Expression | undefined): string | undefined => {
    if (!value) return undefined
    const resolved = resolve(value)
    return ts.isStringLiteral(resolved) || ts.isNoSubstitutionTemplateLiteral(resolved) ? resolved.text : undefined
  }
  const container = (value: ts.Expression): boolean => {
    const resolved = resolve(value)
    if (member(resolved) === 'cardStates') return true
    if (ts.isIdentifier(resolved)) return stateContainers.has(resolved.text)
    return ts.isBinaryExpression(resolved) && resolved.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken && container(resolved.left)
  }
  const cardValue = (value: ts.Expression): boolean => {
    const resolved = resolve(value)
    if (ts.isIdentifier(resolved)) return cardValues.has(resolved.text)
    return (ts.isElementAccessExpression(resolved) || ts.isPropertyAccessExpression(resolved)) && container(resolved.expression)
  }
  const entries = (value: ts.Expression): 'values' | 'entries' | undefined => {
    const resolved = resolve(value)
    if (!ts.isCallExpression(resolved) || !ts.isPropertyAccessExpression(resolved.expression) || !ts.isIdentifier(resolved.expression.expression)
      || resolved.expression.expression.text !== 'Object' || !resolved.arguments[0] || !container(resolved.arguments[0])) return undefined
    const name = resolved.expression.name.text
    return name === 'entries' || name === 'values' ? name : undefined
  }
  const bindValues = (name: ts.BindingName, kind: 'values' | 'entries') => {
    if (kind === 'values' && ts.isIdentifier(name)) cardValues.add(name.text)
    if (kind === 'entries' && ts.isArrayBindingPattern(name)) {
      const value = name.elements[1]
      if (value && ts.isBindingElement(value) && ts.isIdentifier(value.name)) cardValues.add(value.name.text)
    }
  }
  const collect = (node: ts.Node): void => {
    if (ts.isImportSpecifier(node)) importedHelpers.set(node.name.text, node.propertyName?.text ?? node.name.text)
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.name)) aliases.set(node.name.text, node.initializer)
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isObjectBindingPattern(node.name)) {
      for (const binding of node.name.elements) if ((binding.propertyName?.getText(source) ?? binding.name.getText(source)) === 'cardStates' && ts.isIdentifier(binding.name)) stateContainers.add(binding.name.text)
    }
    ts.forEachChild(node, collect)
  }
  collect(source)
  const collectValues = (node: ts.Node): void => {
    if (ts.isForOfStatement(node) && ts.isVariableDeclarationList(node.initializer)) {
      const kind = entries(node.expression)
      if (kind) for (const declaration of node.initializer.declarations) bindValues(declaration.name, kind)
    }
    if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isCallExpression(node.parent) && ts.isPropertyAccessExpression(node.parent.expression)) {
      const kind = entries(node.parent.expression.expression)
      if (kind && node.parameters[0]) bindValues(node.parameters[0].name, kind)
    }
    ts.forEachChild(node, collectValues)
  }
  collectValues(source)
  const report = (node: ts.Node, kind: CardStateBoundaryKind, reason: string): void => {
    findings.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, kind, reason })
  }
  const isCardPrompt = (value: string | undefined): boolean => !!value && (
    /(?:[A-E]|M)\d{3}_/.test(value) || cardPromptKeys.some((key) => key === value || value.length > 'ui.interaction'.length && key.startsWith(value))
  )
  const prompt = (value: ts.Expression): boolean => {
    const resolved = resolve(value)
    return member(resolved) === 'promptKey' || ts.isIdentifier(resolved) && resolved.text === 'promptKey'
  }
  const comparisons = new Set([ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken])
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text
      const basename = path.basename(specifier).replace(/\.[cm]?[jt]sx?$/, '').replaceAll(/[-_]/g, '').toLowerCase()
      if (/\/(?:[A-E]|M)\/(?:[A-E]|M)\d+_/.test(specifier) || /(?:^|\/)(?:[A-E]|M)\d+_[^/]+(?:-state|_state)/.test(specifier)
        || cardNames.some((name) => [name.toLowerCase() + 'state', name.toLowerCase() + 'storage'].includes(basename))) {
        report(node, 'card-storage-import', 'Generic code must not import an individual Card Source or its private storage helper; consume a contribution or recorded presentation.')
      }
    }
    if (client && ts.isVariableDeclaration(node) && node.initializer && ts.isObjectBindingPattern(node.name) && cardValue(node.initializer)) {
      if (node.name.elements.some((binding) => (binding.propertyName?.getText(source) ?? binding.name.getText(source)) !== 'privateData')) {
        report(node, 'raw-client-state', 'Destructuring raw Card State bypasses recorded public presentation.')
      }
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const key = ts.isPropertyAccessExpression(node) ? node.name.text : literal(node.argumentExpression)
      if (container(node.expression) && key !== undefined && key !== 'hasOwnProperty') report(node, 'single-card-state', `Card State for '${key}' must be interpreted by its owning source; use a generic contribution.`)
      if (client && cardValue(node.expression) && key !== 'privateData') report(node, 'raw-client-state', 'Frontend and Replay must consume recorded presentation or authoritative zones, not raw Card State fields.')
    }
    if (ts.isCallExpression(node)) {
      const callee = resolve(node.expression)
      const name = ts.isIdentifier(callee) ? importedHelpers.get(callee.text) ?? callee.text : undefined
      if (name && helperNames.has(name) && literal(node.arguments[1]) !== undefined) report(node, 'single-card-state', 'A generic Card State helper with a fixed card id still belongs in that Card Source.')
      if (ts.isPropertyAccessExpression(node.expression) && ['startsWith', 'includes', 'indexOf'].includes(node.expression.name.text)
        && prompt(node.expression.expression) && isCardPrompt(literal(node.arguments[0]))) report(node, 'card-prompt-policy', 'Card-specific prompt text cannot authorize behavior; declare the current Anytime Window or interaction contract.')
    }
    if (ts.isBinaryExpression(node) && comparisons.has(node.operatorToken.kind)
      && ((prompt(node.left) && isCardPrompt(literal(node.right))) || (prompt(node.right) && isCardPrompt(literal(node.left))))) report(node, 'card-prompt-policy', 'Card-specific prompt comparisons cannot decide behavior; use an explicit interaction contract.')
    if (ts.isCaseClause(node) && isCardPrompt(literal(node.expression)) && ts.isCaseBlock(node.parent) && ts.isSwitchStatement(node.parent.parent)
      && prompt(node.parent.parent.expression)) report(node, 'card-prompt-policy', 'Card-specific prompt switch cases cannot decide behavior; use an explicit interaction contract.')
    ts.forEachChild(node, visit)
  }
  visit(source)
  return findings.sort((a, b) => a.line - b.line || a.kind.localeCompare(b.kind))
}

export const checkCardStateBoundaries = (repoRoot: string, exceptions: readonly CardStateBoundaryException[] = []): CardStateBoundaryResult => {
  const result: CardStateBoundaryResult = { findings: [], scopeErrors: [], filesChecked: 0 }
  const cardRoot = path.join(repoRoot, 'shared/cards')
  const declaredPrompts = (files: string[]): Set<string> => {
    const prompts = new Set<string>()
    for (const file of files) {
      if (isTestFile(file) || !isSourceFile(file)) continue
      const source = parseSource(file)
      const constants = new Map<string, ts.Expression>()
      const collect = (node: ts.Node): void => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) constants.set(node.name.text, node.initializer)
        ts.forEachChild(node, collect)
      }
      collect(source)
      const literal = (expression: ts.Expression, seen = new Set<string>()): string | undefined => {
        const value = unwrap(expression)
        if (ts.isIdentifier(value) && constants.has(value.text) && !seen.has(value.text)) {
          seen.add(value.text); return literal(constants.get(value.text)!, seen)
        }
        return ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value) ? value.text : undefined
      }
      const visit = (node: ts.Node): void => {
        if (ts.isPropertyAssignment(node) && ['promptKey', 'optionalPromptKey'].includes(node.name.getText(source).replaceAll("'", ''))) {
          const key = literal(node.initializer)
          if (key) prompts.add(key)
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    return prompts
  }
  let cardPromptKeys: string[] = []
  let cardNames: string[] = []
  try {
    const authorFiles = walkSourceFiles(cardRoot)
    cardNames = authorFiles.flatMap((file) => {
      const name = path.basename(file).match(/^(?:[A-E]|M)\d+_(\w+)\.ts$/)?.[1]
      return name ? [name] : []
    })
    if (!authorFiles.some((file) => /^(?:[A-E]|M)\d+_\w+\.ts$/.test(path.basename(file)))) result.scopeErrors.push('Card Source discovery contains no author sources')
    const genericFiles = ['shared/actions', 'shared/engine', 'shared/session'].flatMap((root) => walkSourceFiles(path.join(repoRoot, root)))
    const genericPrompts = declaredPrompts(genericFiles)
    cardPromptKeys = [...declaredPrompts(authorFiles)].filter((key) => !genericPrompts.has(key)).sort()
  } catch (error) { result.scopeErrors.push(`Card/prompt source discovery: ${String(error)}`) }
  for (const root of CARD_STATE_SCAN_ROOTS) {
    let files: string[]
    try { files = walkSourceFiles(path.join(repoRoot, root)).filter((file) => isSourceFile(file) && !isTestFile(file)) }
    catch (error) { result.scopeErrors.push(`${root}: ${String(error)}`); continue }
    if (!files.length) { result.scopeErrors.push(`${root}: required production root is empty`); continue }
    for (const file of files) {
      const relative = path.relative(repoRoot, file).split(path.sep).join('/')
      try { result.findings.push(...scanCardStateSource(parseSource(file), relative, cardPromptKeys, cardNames)); result.filesChecked++ }
      catch (error) { result.scopeErrors.push(`${relative}: ${String(error)}`) }
    }
  }
  const keys = new Set<string>()
  for (const exception of exceptions) {
    const key = `${exception.file}:${exception.line}:${exception.kind}`
    if (!exception.reason.trim() || !Number.isInteger(exception.line) || exception.line < 1 || !isSourceFile(exception.file) || exception.file.includes('*') || keys.has(key)) {
      result.scopeErrors.push(`Invalid exact exception: ${key}`); continue
    }
    keys.add(key)
    const matches = result.findings.filter((finding) => `${finding.file}:${finding.line}:${finding.kind}` === key)
    if (matches.length !== 1) { result.scopeErrors.push(`Stale or ambiguous exception: ${key}`); continue }
    result.findings = result.findings.filter((finding) => finding !== matches[0])
  }
  result.scopeErrors.sort()
  result.findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind))
  return result
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkCardStateBoundaries(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))
  for (const error of result.scopeErrors) console.error(`[card-state-boundaries] ${error}`)
  for (const finding of result.findings) console.error(`${finding.file}:${finding.line} [${finding.kind}] ${finding.reason}`)
  console.log(`[card-state-boundaries] checked ${result.filesChecked} production files across ${CARD_STATE_SCAN_ROOTS.length} required roots; ${result.findings.length} violation(s)`)
  process.exitCode = result.scopeErrors.length || result.findings.length ? 1 : 0
}
