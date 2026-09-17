import ts from 'typescript'

/**
 * Static companion to the runtime listener purity guard.
 *
 * Scans one resolved card-listener function body for explicit writes whose
 * target chain is rooted in the listener's context parameter: assignments
 * (including compound assignment), `delete`, `++`/`--`, mutating array
 * methods, and `Object.assign` / `Object.defineProperty` / `Object.freeze`
 * style calls. Local aliases declared from context chains (`const p =
 * ctx.player`, destructuring, `??` / `||` / ternary fallbacks, `.find()`
 * results, `for...of` variables and array callback parameters) are followed
 * inside the same function. It does not follow calls into other functions or
 * files; runtime coverage owns those paths.
 */

export const LISTENER_CONTEXT_STATE_KEYS = new Set([
  'state',
  'player',
  'triggerPlayer',
  'ownerPlayer',
  'effectPlayer',
  'space',
  'actionContext',
  'params',
  'result',
  'transactionEvents',
  'actionEvents',
  'triggerSnapshot',
  'extraData',
])

const MUTATING_ARRAY_METHODS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin'])
const MUTATING_OBJECT_STATICS = new Set(['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf', 'freeze', 'seal', 'preventExtensions'])
const PASSTHROUGH_CALLS = new Set(['find', 'findLast', 'at'])
const ELEMENT_CALLBACK_METHODS = new Set(['forEach', 'map', 'filter', 'find', 'findLast', 'some', 'every', 'flatMap', 'reduce'])

export type ListenerMutationFinding = {
  kind: 'assign' | 'delete' | 'update' | `array.${string}` | `Object.${string}`
  text: string
}

const unwrap = (node: ts.Expression): ts.Expression => {
  let cur = node
  while (
    ts.isParenthesizedExpression(cur)
    || ts.isAsExpression(cur)
    || ts.isNonNullExpression(cur)
    || ts.isTypeAssertionExpression(cur)
    || ts.isSatisfiesExpression(cur)
  ) {
    cur = cur.expression
  }
  return cur
}

/** Parses a runtime function through `Function.prototype.toString`. */
export function parseListenerFunction(fn: unknown, fileName: string): ts.FunctionLikeDeclaration | null {
  const source = Function.prototype.toString.call(fn)
  for (const text of [`const handler = (${source})`, `const holder = { ${source} }`]) {
    const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const diagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []
    if (diagnostics.length > 0) continue
    const found = findFirstFunction(sourceFile)
    if (found) return found
  }
  return null
}

const findFirstFunction = (root: ts.Node): ts.FunctionLikeDeclaration | null => {
  let found: ts.FunctionLikeDeclaration | null = null
  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) {
      found = node
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  return found
}

const fallbackBranches = (expression: ts.Expression): ts.Expression[] => {
  const node = unwrap(expression)
  if (
    ts.isBinaryExpression(node)
    && (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    return [...fallbackBranches(node.left), ...fallbackBranches(node.right)]
  }
  if (ts.isConditionalExpression(node)) return [...fallbackBranches(node.whenTrue), ...fallbackBranches(node.whenFalse)]
  return [node]
}

const chainRoot = (expression: ts.Expression): ts.Identifier | null => {
  let cur = unwrap(expression)
  for (;;) {
    if (ts.isIdentifier(cur)) return cur
    if (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) {
      cur = unwrap(cur.expression)
      continue
    }
    if (ts.isCallExpression(cur)) {
      const callee = unwrap(cur.expression)
      if (ts.isPropertyAccessExpression(callee) && PASSTHROUGH_CALLS.has(callee.name.text)) {
        cur = unwrap(callee.expression)
        continue
      }
      return null
    }
    return null
  }
}

const bindingNames = (name: ts.BindingName): ts.Identifier[] => {
  if (ts.isIdentifier(name)) return [name]
  const names: ts.Identifier[] = []
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) names.push(...bindingNames(element.name))
  }
  return names
}

const contextBindingNames = (pattern: ts.ObjectBindingPattern): ts.Identifier[] => {
  const names: ts.Identifier[] = []
  for (const element of pattern.elements) {
    const property = element.propertyName ?? element.name
    const key = ts.isIdentifier(property) || ts.isStringLiteral(property) ? property.text : null
    if (key && LISTENER_CONTEXT_STATE_KEYS.has(key)) names.push(...bindingNames(element.name))
  }
  return names
}

/**
 * Returns explicit writes to authoritative context state inside `fn`.
 * Returns an empty array for a pure function body.
 */
export function collectListenerMutationFindings(fn: ts.FunctionLikeDeclaration): ListenerMutationFinding[] {
  const findings: ListenerMutationFinding[] = []
  const authoritative = new Set<string>()
  const parameter = fn.parameters[0]
  if (!parameter) return findings
  if (ts.isIdentifier(parameter.name)) authoritative.add(parameter.name.text)
  else if (ts.isObjectBindingPattern(parameter.name)) {
    for (const name of contextBindingNames(parameter.name)) authoritative.add(name.text)
  }
  if (authoritative.size === 0) return findings

  const isAuthoritative = (expression: ts.Expression): boolean =>
    fallbackBranches(expression).some((branch) => {
      const root = chainRoot(branch)
      return root !== null && authoritative.has(root.text)
    })

  const markAlias = (name: ts.BindingName): boolean => {
    let changed = false
    for (const identifier of bindingNames(name)) {
      if (!authoritative.has(identifier.text)) {
        authoritative.add(identifier.text)
        changed = true
      }
    }
    return changed
  }

  let changed = true
  const collectAliases = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer && isAuthoritative(node.initializer)) {
      if (markAlias(node.name)) changed = true
    }
    if (ts.isForOfStatement(node) && ts.isVariableDeclarationList(node.initializer) && isAuthoritative(node.expression)) {
      const declaration = node.initializer.declarations[0]
      if (declaration && markAlias(declaration.name)) changed = true
    }
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression)
      if (
        ts.isPropertyAccessExpression(callee)
        && ELEMENT_CALLBACK_METHODS.has(callee.name.text)
        && isAuthoritative(callee.expression)
      ) {
        const callback = node.arguments[0] && unwrap(node.arguments[0])
        if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
          const elementParameter = callee.name.text === 'reduce' ? callback.parameters[1] : callback.parameters[0]
          if (elementParameter && markAlias(elementParameter.name)) changed = true
        }
      }
    }
    ts.forEachChild(node, collectAliases)
  }
  while (changed) {
    changed = false
    collectAliases(fn)
  }

  const report = (kind: ListenerMutationFinding['kind'], node: ts.Node): void => {
    findings.push({ kind, text: node.getText().replace(/\s+/g, ' ').slice(0, 160) })
  }
  const isAssignmentOperator = (kind: ts.SyntaxKind): boolean =>
    kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment

  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) {
      const target = unwrap(node.left)
      if ((ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) && isAuthoritative(target)) {
        report('assign', node)
      }
    }
    if (ts.isDeleteExpression(node) && isAuthoritative(node.expression)) report('delete', node)
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
      && isAuthoritative(node.operand)
    ) {
      report('update', node)
    }
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression)
      if (ts.isPropertyAccessExpression(callee)) {
        if (MUTATING_ARRAY_METHODS.has(callee.name.text) && isAuthoritative(callee.expression)) {
          report(`array.${callee.name.text}`, node)
        }
        const receiver = unwrap(callee.expression)
        if (
          ts.isIdentifier(receiver)
          && receiver.text === 'Object'
          && MUTATING_OBJECT_STATICS.has(callee.name.text)
          && node.arguments[0]
          && isAuthoritative(node.arguments[0])
        ) {
          report(`Object.${callee.name.text}`, node)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(fn)
  return findings
}
