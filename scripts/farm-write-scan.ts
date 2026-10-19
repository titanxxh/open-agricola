import ts from 'typescript'

import { FARM_LAYOUT_KEYS } from '../shared/contract/types'

export const FARM_LAYOUT_PROPERTIES = new Set<string>(FARM_LAYOUT_KEYS)
const mutators = new Set(['push', 'pop', 'splice', 'shift', 'unshift', 'sort', 'reverse', 'fill', 'copyWithin'])
export type FarmWriteFinding = { line: number; text: string; owner: string }

const unwrap = (node: ts.Expression): ts.Expression => {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)
    || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node)) node = node.expression
  return node
}
const property = (node: ts.Expression): { base: ts.Expression; name: string } | undefined => {
  node = unwrap(node)
  if (ts.isPropertyAccessExpression(node)) return { base: node.expression, name: node.name.text }
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    const key = unwrap(node.argumentExpression)
    if (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) return { base: node.expression, name: key.text }
  }
}
const functionOwner = (node: ts.Node): string => {
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)
      && current.initializer && (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer))) return current.name.text
    if (ts.isMethodDeclaration(current) && current.name && ts.isIdentifier(current.name)) return current.name.text
  }
  return '<module>'
}

/** Syntax-level structural writes. Crop stacks and animal assignments are not layout. */
export function collectFarmWrites(source: ts.SourceFile): FarmWriteFinding[] {
  let arrays = new Set<string>()
  let elements = new Set<string>()
  let players = new Set<string>()
  const arrayReference = (raw: ts.Expression): boolean => {
    const node = unwrap(raw)
    if (ts.isIdentifier(node)) return arrays.has(node.text)
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) return arrayReference(node.left)
    const access = property(node)
    return !!access && (FARM_LAYOUT_PROPERTIES.has(access.name) || access.name === 'tiles' && elementReference(access.base))
  }
  const elementReference = (raw: ts.Expression): boolean => {
    const node = unwrap(raw)
    return (ts.isIdentifier(node) && elements.has(node.text))
      || (ts.isElementAccessExpression(node) && arrayReference(node.expression))
      || (ts.isCallExpression(node) && !!property(node.expression) && ['find', 'at'].includes(property(node.expression)!.name) && arrayReference(property(node.expression)!.base))
  }
  const playerReference = (raw: ts.Expression): boolean => {
    const node = unwrap(raw)
    return ts.isIdentifier(node) && players.has(node.text)
      || !!property(node) && ['player', 'target', 'ownerPlayer'].includes(property(node)!.name)
  }
  const writesLayout = (raw: ts.Expression): boolean => {
    const node = unwrap(raw)
    if (ts.isIdentifier(node)) return false
    if (ts.isElementAccessExpression(node) && arrayReference(node.expression)) return true
    const access = property(node)
    if (!access) return false
    if (FARM_LAYOUT_PROPERTIES.has(access.name)) return true
    if (access.name === 'length' && arrayReference(access.base)) return true
    if (['row', 'col', 'tiles', 'edge', 'kind', 'covered', 'spaceKey', 'blocksPlacement'].includes(access.name)) return elementReference(access.base)
    return false
  }
  const findings: FarmWriteFinding[] = []
  const record = (node: ts.Node) => findings.push({ line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    text: node.getText(source), owner: functionOwner(node) })
  const visit = (node: ts.Node): void => {
    const scope = ts.isFunctionLike(node) || ts.isForOfStatement(node)
    const prior = { arrays, elements, players }
    if (scope) {
      arrays = new Set(arrays); elements = new Set(elements); players = new Set(players)
    }
    if (ts.isFunctionLike(node)) {
      const parent = node.parent
      if (ts.isCallExpression(parent) && property(parent.expression) && arrayReference(property(parent.expression)!.base)) {
        const parameter = node.parameters[0]
        if (parameter && ts.isIdentifier(parameter.name)) elements.add(parameter.name.text)
      }
    }
    if (ts.isForOfStatement(node) && arrayReference(node.expression) && ts.isVariableDeclarationList(node.initializer)) {
      const binding = node.initializer.declarations[0]?.name
      if (binding && ts.isIdentifier(binding)) elements.add(binding.text)
    }
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.type && /\b(?:PlayerState|PlayerFarmState|PlayerFarmAnimalState)\b/.test(node.type.getText(source))) players.add(node.name.text)
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name)) {
        if (arrayReference(node.initializer)) arrays.add(node.name.text)
        if (elementReference(node.initializer)) elements.add(node.name.text)
        if (playerReference(node.initializer)) players.add(node.name.text)
      } else if (ts.isObjectBindingPattern(node.name)) {
        for (const binding of node.name.elements) {
          const key = binding.propertyName ?? binding.name
          if (ts.isIdentifier(key) && FARM_LAYOUT_PROPERTIES.has(key.text) && ts.isIdentifier(binding.name)) arrays.add(binding.name.text)
        }
      }
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment && writesLayout(node.left)) record(node)
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) && writesLayout(node.operand)) record(node)
    if (ts.isDeleteExpression(node) && writesLayout(node.expression)) record(node)
    if (ts.isCallExpression(node)) {
      const call = property(node.expression)
      if (call && mutators.has(call.name) && arrayReference(call.base)) record(node)
      if (call && ts.isIdentifier(call.base) && call.base.text === 'Object' && call.name === 'assign') {
        const target = node.arguments[0]
        const hasLayoutSource = node.arguments.slice(1).some(argument => {
          const value = unwrap(argument)
          return ts.isObjectLiteralExpression(value) && value.properties.some(member => {
            if (ts.isSpreadAssignment(member)) return false
            const name = member.name
            return (ts.isIdentifier(name) || ts.isStringLiteral(name)) && FARM_LAYOUT_PROPERTIES.has(name.text)
          })
        })
        if (target && (arrayReference(target) || elementReference(target) || playerReference(target) || hasLayoutSource)) record(node)
      }
    }
    ts.forEachChild(node, visit)
    if (scope) ({ arrays, elements, players } = prior)
  }
  visit(source)
  return findings
}

export const FARM_WRITE_OWNERS = new Map([
  ['shared/domain/farm-operations.ts#commitFarmOperation', 'authoritative farm layout commit'],
  ['shared/domain/farm-operations.ts#commitPreparedPlayer', 'validated player projection commit'],
  ['shared/session/state-bootstrap.ts#normalizeState', 'snapshot restoration normalization'],
  ['shared/session/state-bootstrap.ts#createInitialState', 'initial Moor board deal'],
])
