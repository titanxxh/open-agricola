import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { parseSource, sourceExtensions, walkSourceFiles } from './source-files'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export type DirectSessionLogViolationKind =
  | 'state-log-write'
  | 'log-store-constructor'
  | 'log-store-append'
  | 'log-cache-writer-call'
  | 'stale-exemption'

export type DirectSessionLogViolation = {
  file: string
  line: number
  kind: DirectSessionLogViolationKind
  text: string
}

const SCAN_DIRS = ['shared', 'server', 'scripts']
const SKIP_FILE_PATTERNS = [
  /^scripts\/check-direct-session-log\.ts$/,
  /^scripts\/__tests__\/check-direct-session-log\.test\.ts$/,
]

const logExemptions = [
  {
    file: 'shared/session/session-core.ts', functionName: 'constructor', kind: 'log-store-constructor',
    reason: 'GameCore owns the engine log store shared by its execution frames.',
  },
  {
    file: 'shared/engine/engine.ts', functionName: 'flushEventTransaction', kind: 'log-store-append',
    reason: 'Committed engine events are mapped into the session log store.',
  },
  {
    file: 'shared/engine/engine-proceed.ts', functionName: 'appendDerivedLogsForEventOnlyResult', kind: 'log-store-append',
    reason: 'Event-only proceed results contribute mapper-derived log entries.',
  },
  {
    file: 'shared/engine/engine-resolve.ts', functionName: 'appendDerivedLogsForEventOnlyResult', kind: 'log-store-append',
    reason: 'Event-only resolve results contribute mapper-derived log entries.',
  },
  {
    file: 'shared/events/append.ts', functionName: 'appendImmediateEvents', kind: 'log-cache-writer-call',
    reason: 'Immediate public events update the cache through mapper output.',
  },
  {
    file: 'shared/session/session-core.ts', functionName: 'flushEngineLog', kind: 'log-cache-writer-call',
    reason: 'The session flushes derived engine entries into its visible log cache.',
  },
  {
    file: 'shared/events/log-cache.ts', functionName: 'prependDerivedLogEntries', kind: 'state-log-write',
    reason: 'The cache writer prepends already-derived entries to GameState.log.',
  },
] as const

type LogExemption = typeof logExemptions[number]

type FunctionBlock = {
  start: number
  end: number
  body: ts.Block
}

const lineNumberForIndex = (source: string, index: number): number =>
  source.slice(0, index).split('\n').length

const lineText = (source: string, line: number): string =>
  source.split('\n')[line - 1]?.trim() ?? ''

const allowedTestLogStoreConstructor = (file: string): boolean =>
  file.includes('/__tests__/') || /\.test\.[cm]?[jt]sx?$/.test(file)

const allowedTestLogCacheWriterCall = (file: string): boolean =>
  file.includes('/__tests__/') || /\.test\.[cm]?[jt]sx?$/.test(file)

const findFunctionBlock = (
  sourceFile: ts.SourceFile,
  functionName: string,
): FunctionBlock | null => {
  let block: FunctionBlock | null = null
  const fromBody = (body: ts.Block): FunctionBlock => ({
    start: body.getStart(sourceFile),
    end: body.getEnd(),
    body,
  })
  const visit = (node: ts.Node): void => {
    if (block) return
    if (ts.isConstructorDeclaration(node) && functionName === 'constructor' && node.body
      && ts.isClassDeclaration(node.parent) && node.parent.name?.text === 'GameCore') {
      block = fromBody(node.body)
      return
    }
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node))
      && node.name?.getText(sourceFile) === functionName
      && node.body) {
      block = fromBody(node.body)
      return
    }
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === functionName
      && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      && ts.isBlock(node.initializer.body)) {
      block = fromBody(node.initializer.body)
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return block
}

const LOG_MUTATORS = new Set(['copyWithin', 'fill', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'])
const GAME_STATE_FACTORY_NAMES = new Set(['createInitialState', 'normalizeState', 'rebuildActiveModifiers'])

const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  let current = expression
  while (ts.isParenthesizedExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.CommaToken)) {
    current = ts.isBinaryExpression(current) ? current.right : current.expression
  }
  return current
}

const accessName = (expression: ts.Expression): string | null => {
  const current = unwrapExpression(expression)
  if (ts.isPropertyAccessExpression(current)) return current.name.text
  if (ts.isElementAccessExpression(current)) {
    const argument = current.argumentExpression && unwrapExpression(current.argumentExpression)
    if (argument && ts.isStringLiteralLike(argument)) return argument.text
  }
  return null
}

const accessReceiver = (expression: ts.Expression): ts.Expression | null => {
  const current = unwrapExpression(expression)
  if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) return current.expression
  return null
}

const includesGameStateType = (type: ts.TypeNode | undefined, sourceFile: ts.SourceFile): boolean =>
  type?.getText(sourceFile).includes('GameState') ?? false

const expressionName = (expression: ts.Expression): string | null => {
  const current = unwrapExpression(expression)
  if (ts.isIdentifier(current)) return current.text
  return accessName(current)
}

const isGameStateExpression = (expression: ts.Expression, sourceFile: ts.SourceFile): boolean => {
  if ((ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression))
    && includesGameStateType(expression.type, sourceFile)) {
    return true
  }
  const current = unwrapExpression(expression)
  return ts.isCallExpression(current)
    && !!expressionName(current.expression)
    && GAME_STATE_FACTORY_NAMES.has(expressionName(current.expression)!)
}

const collectBindingNames = (name: ts.BindingName, out: string[]): void => {
  if (ts.isIdentifier(name)) {
    out.push(name.text)
    return
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) collectBindingNames(element.name, out)
  }
}

const sourceRoots = new WeakMap<ts.SourceFile, string>()
const sourceCheckers = new WeakMap<ts.SourceFile, ts.TypeChecker>()

const resolvedModule = (specifier: string, sourceFile: ts.SourceFile): string | null => {
  const root = sourceRoots.get(sourceFile)
  if (!root || !specifier.startsWith('.')) return null
  return path.relative(root, path.resolve(path.dirname(sourceFile.fileName), specifier))
    .replaceAll(path.sep, '/').replace(sourceExtensions, '')
}

const isLogCacheModule = (specifier: string, sourceFile: ts.SourceFile): boolean =>
  ['shared/events', 'shared/events/index', 'shared/events/log-cache'].includes(resolvedModule(specifier, sourceFile) ?? '')

const sourceChecker = (sourceFile: ts.SourceFile): ts.TypeChecker => {
  let checker = sourceCheckers.get(sourceFile)
  if (!checker) {
    const options = { noResolve: true, noLib: true }
    const host = ts.createCompilerHost(options)
    host.getSourceFile = fileName => fileName === sourceFile.fileName ? sourceFile : undefined
    checker = ts.createProgram([sourceFile.fileName], options, host).getTypeChecker()
    sourceCheckers.set(sourceFile, checker)
  }
  return checker
}

const isCanonicalMapper = (expression: ts.Expression): boolean => {
  const sourceFile = expression.getSourceFile()
  const declarations = sourceChecker(sourceFile).getSymbolAtLocation(unwrapExpression(expression))?.declarations
  return declarations?.some(declaration => {
    if (!ts.isImportSpecifier(declaration) || (declaration.propertyName ?? declaration.name).text !== 'eventsToLogEntries') return false
    const imported = declaration.parent.parent.parent
    return ts.isImportDeclaration(imported) && ts.isStringLiteralLike(imported.moduleSpecifier)
      && resolvedModule(imported.moduleSpecifier.text, sourceFile) === 'shared/events/log-mapper'
  }) ?? false
}

const requiredModule = (expression: ts.Expression): string | null => {
  const current = unwrapExpression(expression)
  return ts.isCallExpression(current)
    && ts.isIdentifier(current.expression) && current.expression.text === 'require'
    && current.arguments.length === 1 && ts.isStringLiteralLike(current.arguments[0]!)
    ? current.arguments[0]!.text : null
}

const isLogCacheNamespace = (expression: ts.Expression, namespaces: ReadonlySet<string>): boolean => {
  const current = unwrapExpression(expression)
  const module = requiredModule(current)
  return (ts.isIdentifier(current) && namespaces.has(current.text)) || (module !== null && isLogCacheModule(module, current.getSourceFile()))
}

const isLogStoreModule = (specifier: string, sourceFile: ts.SourceFile): boolean =>
  ['shared/engine', 'shared/engine/index', 'shared/engine/log-store'].includes(resolvedModule(specifier, sourceFile) ?? '')

const isLogStoreNamespace = (expression: ts.Expression, namespaces: ReadonlySet<string>): boolean => {
  const current = unwrapExpression(expression)
  const module = requiredModule(current)
  return (ts.isIdentifier(current) && namespaces.has(current.text))
    || (module !== null && isLogStoreModule(module, current.getSourceFile()))
}

const collectImportedIdentifiers = (
  sourceFile: ts.SourceFile,
): {
  logStoreClassNames: Set<string>
  logStoreClassNamespaces: Set<string>
  logCacheWriterNames: Set<string>
  logCacheWriterNamespaces: Set<string>
} => {
  const logStoreClassNames = new Set(['LogStore'])
  const logStoreClassNamespaces = new Set<string>()
  const logCacheWriterNames = new Set<string>()
  const logCacheWriterNamespaces = new Set<string>()
  for (const statement of sourceFile.statements) {
    if (ts.isImportEqualsDeclaration(statement) && ts.isExternalModuleReference(statement.moduleReference)) {
      const specifier = statement.moduleReference.expression
      if (specifier && ts.isStringLiteralLike(specifier)) {
        if (isLogCacheModule(specifier.text, sourceFile)) logCacheWriterNamespaces.add(statement.name.text)
        if (isLogStoreModule(specifier.text, sourceFile)) logStoreClassNamespaces.add(statement.name.text)
      }
    }
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const clause = statement.importClause
    const namedBindings = clause?.namedBindings
    if (!namedBindings) continue
    if (isLogStoreModule(statement.moduleSpecifier.text, sourceFile) && ts.isNamespaceImport(namedBindings)) {
      logStoreClassNamespaces.add(namedBindings.name.text)
    }
    if (isLogCacheModule(statement.moduleSpecifier.text, sourceFile) && ts.isNamespaceImport(namedBindings)) {
      logCacheWriterNamespaces.add(namedBindings.name.text)
      continue
    }
    if (!ts.isNamedImports(namedBindings)) continue
    for (const specifier of namedBindings.elements) {
      const importedName = specifier.propertyName?.text ?? specifier.name.text
      if (importedName === 'LogStore') {
        if (isLogStoreModule(statement.moduleSpecifier.text, sourceFile)) logStoreClassNames.add(specifier.name.text)
        else logStoreClassNames.delete(specifier.name.text)
      }
      if (isLogCacheModule(statement.moduleSpecifier.text, sourceFile) && importedName === 'prependDerivedLogEntries') {
        logCacheWriterNames.add(specifier.name.text)
      }
    }
  }
  return { logStoreClassNames, logStoreClassNamespaces, logCacheWriterNames, logCacheWriterNamespaces }
}

const isStateLikeIdentifier = (name: string, stateLikeNames: ReadonlySet<string>): boolean =>
  stateLikeNames.has(name) || /(?:State|state)$/.test(name)

const isStateLikeExpression = (
  expression: ts.Expression,
  stateLikeNames: ReadonlySet<string>,
): boolean => {
  const current = unwrapExpression(expression)
  if (ts.isIdentifier(current)) return isStateLikeIdentifier(current.text, stateLikeNames)
  return accessName(current) === 'state'
}

const isStateLogExpression = (
  expression: ts.Expression,
  stateLikeNames: ReadonlySet<string>,
): boolean => {
  const current = unwrapExpression(expression)
  const receiver = accessReceiver(current)
  return accessName(current) === 'log'
    && !!receiver
    && isStateLikeExpression(receiver, stateLikeNames)
}

const isStateLogMutationTarget = (
  expression: ts.Expression,
  stateLikeNames: ReadonlySet<string>,
  stateLogAliases: ReadonlySet<string>,
): boolean => {
  const current = unwrapExpression(expression)
  if (isStateLogExpression(current, stateLikeNames)) return true
  if (ts.isIdentifier(current)) return stateLogAliases.has(current.text)
  if (ts.isCallExpression(current)) {
    const callReceiver = accessReceiver(current.expression)
    return !!callReceiver && isStateLogMutationTarget(callReceiver, stateLikeNames, stateLogAliases)
  }
  const receiver = accessReceiver(current)
  if (!receiver) return false
  return isStateLogMutationTarget(receiver, stateLikeNames, stateLogAliases)
}

const isStateLogReceiverText = (
  expression: ts.Expression,
  stateLikeNames: ReadonlySet<string>,
  sourceFile: ts.SourceFile,
): boolean => {
  let text = expression.getText(sourceFile).replace(/\s+/g, '')
  while (text.startsWith('(') && text.endsWith(')')) text = text.slice(1, -1)
  const dotSuffix = '.log'
  const bracketSuffixes = ['["log"]', "['log']"]
  const subject = text.endsWith(dotSuffix)
    ? text.slice(0, -dotSuffix.length)
    : bracketSuffixes.find((suffix) => text.endsWith(suffix))
      ? text.slice(0, -(bracketSuffixes.find((suffix) => text.endsWith(suffix))?.length ?? 0))
      : null
  return !!subject
    && (stateLikeNames.has(subject)
      || /(?:State|state)$/.test(subject)
      || subject.endsWith('.state'))
}

const isLogStoreExpression = (
  expression: ts.Expression,
  logStoreAliases: ReadonlySet<string>,
): boolean => {
  const current = unwrapExpression(expression)
  if (ts.isIdentifier(current)) return logStoreAliases.has(current.text)
  const name = accessName(current)
  if (name === 'engineLog') return true
  if (name !== 'log') return false
  const receiver = accessReceiver(current)
  const unwrappedReceiver = receiver && unwrapExpression(receiver)
  return !!unwrappedReceiver
    && (unwrappedReceiver.kind === ts.SyntaxKind.ThisKeyword
      || (ts.isIdentifier(unwrappedReceiver) && unwrappedReceiver.text === 'int'))
}

const isLogStoreBindingSource = (
  expression: ts.Expression,
  propertyName: string,
): boolean => {
  const current = unwrapExpression(expression)
  if (propertyName === 'engineLog') return current.kind === ts.SyntaxKind.ThisKeyword
  return propertyName === 'log'
    && (current.kind === ts.SyntaxKind.ThisKeyword || (ts.isIdentifier(current) && current.text === 'int'))
}

const isLogStoreConstructorExpression = (
  expression: ts.Expression,
  logStoreClassNames: ReadonlySet<string>,
  logStoreClassNamespaces: ReadonlySet<string>,
  logStoreConstructorAliases: ReadonlySet<string>,
): boolean => {
  const current = unwrapExpression(expression)
  if (ts.isIdentifier(current)) return logStoreClassNames.has(current.text) || logStoreConstructorAliases.has(current.text)
  if (ts.isClassExpression(current)) {
    return current.heritageClauses?.some(clause => clause.token === ts.SyntaxKind.ExtendsKeyword
      && clause.types.some(type => isLogStoreConstructorExpression(
        type.expression, logStoreClassNames, logStoreClassNamespaces, logStoreConstructorAliases,
      ))) ?? false
  }
  const receiver = accessReceiver(current)
  const unwrappedReceiver = receiver && unwrapExpression(receiver)
  return accessName(current) === 'LogStore'
    && !!unwrappedReceiver
    && isLogStoreNamespace(unwrappedReceiver, logStoreClassNamespaces)
}

const isLogStoreConstructorAliasSource = (
  expression: ts.Expression,
  logStoreClassNames: ReadonlySet<string>,
  logStoreClassNamespaces: ReadonlySet<string>,
  logStoreConstructorAliases: ReadonlySet<string>,
): boolean => {
  return isLogStoreConstructorExpression(
    expression,
    logStoreClassNames,
    logStoreClassNamespaces,
    logStoreConstructorAliases,
  )
}

const isMapperEntryExpression = (expression: ts.Expression | undefined, variableName: string): boolean => {
  if (!expression) return false
  const current = unwrapExpression(expression)
  return ts.isElementAccessExpression(current)
    && ts.isIdentifier(unwrapExpression(current.expression))
    && (unwrapExpression(current.expression) as ts.Identifier).text === variableName
}

const cacheWriterCallName = (
  expression: ts.Expression,
  logCacheWriterNames: ReadonlySet<string>,
  logCacheWriterNamespaces: ReadonlySet<string>,
  logCacheWriterAliases: ReadonlySet<string> = new Set(),
): string | null => {
  const current = unwrapExpression(expression)
  if (ts.isIdentifier(current) && logCacheWriterAliases.has(current.text)) return current.text
  if (ts.isIdentifier(current) && logCacheWriterNames.has(current.text)) return current.text
  const receiver = accessReceiver(current)
  const unwrappedReceiver = receiver && unwrapExpression(receiver)
  if (accessName(current) === 'prependDerivedLogEntries'
    && unwrappedReceiver
    && isLogCacheNamespace(unwrappedReceiver, logCacheWriterNamespaces)) {
    return accessName(current)
  }
  return null
}

const isObjectAssignCall = (call: ts.CallExpression): boolean => {
  const current = unwrapExpression(call.expression)
  return ts.isPropertyAccessExpression(current)
    && current.name.text === 'assign'
    && ts.isIdentifier(unwrapExpression(current.expression))
    && (unwrapExpression(current.expression) as ts.Identifier).text === 'Object'
}

const propertyNameText = (name: ts.PropertyName): string | null => {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text
  if (ts.isComputedPropertyName(name)) {
    const expression = unwrapExpression(name.expression)
    if (ts.isStringLiteralLike(expression)) return expression.text
  }
  return null
}

const objectLiteralAliasAssignments = (
  expression: ts.Expression,
  propertyName: string,
): string[] => {
  const current = unwrapExpression(expression)
  if (!ts.isObjectLiteralExpression(current)) return []
  const names: string[] = []
  for (const property of current.properties) {
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === propertyName) {
      names.push(property.name.text)
    }
    if (ts.isPropertyAssignment(property)
      && propertyNameText(property.name) === propertyName
      && ts.isIdentifier(unwrapExpression(property.initializer))) {
      names.push((unwrapExpression(property.initializer) as ts.Identifier).text)
    }
  }
  return names
}

const objectLiteralWritesLogProperty = (expression: ts.Expression): boolean => {
  const current = unwrapExpression(expression)
  if (!ts.isObjectLiteralExpression(current)) return false
  return current.properties.some((property) => {
    if (ts.isPropertyAssignment(property) || ts.isMethodDeclaration(property) || ts.isShorthandPropertyAssignment(property)) {
      return propertyNameText(property.name) === 'log'
    }
    return false
  })
}

const isObjectAssignStateLogWrite = (
  call: ts.CallExpression,
  stateLikeNames: ReadonlySet<string>,
): boolean =>
  isObjectAssignCall(call)
  && !!call.arguments[0]
  && isStateLikeExpression(call.arguments[0]!, stateLikeNames)
  && call.arguments.slice(1).some(objectLiteralWritesLogProperty)

const findDerivedDeclaration = (
  block: FunctionBlock,
  before: ts.Node,
  callee: string,
): ts.VariableDeclaration | undefined => {
  let found: ts.VariableDeclaration | undefined
  const visit = (node: ts.Node): void => {
    if (node.getStart() >= before.getStart() || ts.isFunctionLike(node)) return
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const initializer = unwrapExpression(node.initializer)
      if (ts.isCallExpression(initializer)
        && (callee === 'eventsToLogEntries' ? isCanonicalMapper(initializer.expression) : initializer.expression.getText() === callee)) found = node
    }
    ts.forEachChild(node, visit)
  }
  visit(block.body)
  return found
}

const invocationTarget = (expression: ts.Expression): ts.Expression => {
  const current = unwrapExpression(expression)
  const receiver = accessReceiver(current)
  return receiver && ['call', 'apply'].includes(accessName(current) ?? '') ? invocationTarget(receiver) : current
}

type DerivedReference = 'array' | 'entry' | 'object'

const hasDerivedMutation = (block: FunctionBlock, variableName: string): boolean => {
  const aliases = new Map<string, DerivedReference>([[variableName, 'array']])
  const memberReference = (kind: DerivedReference | undefined, name: string | null): DerivedReference | undefined => {
    if (kind === 'array') return name === 'length' ? undefined : 'entry'
    if (kind === 'entry') return name === 'key' || name === 'playerId' ? undefined : 'object'
    return kind === 'object' ? 'object' : undefined
  }
  const reference = (expression: ts.Expression): DerivedReference | undefined => {
    const current = unwrapExpression(expression)
    if (ts.isIdentifier(current)) return aliases.get(current.text)
    if (ts.isCallExpression(current)) {
      const receiver = accessReceiver(current.expression)
      if (!receiver || reference(receiver) !== 'array') return undefined
      const method = accessName(current.expression) ?? ''
      if (['at', 'find', 'pop', 'shift'].includes(method)) return 'entry'
      if (['filter', 'slice', 'concat', 'toReversed', 'toSorted', 'with'].includes(method)) return 'array'
      return undefined
    }
    const receiver = accessReceiver(current)
    return receiver ? memberReference(reference(receiver), accessName(current)) : undefined
  }
  const isMutationTarget = (expression: ts.Expression): boolean => {
    const current = unwrapExpression(expression)
    if (ts.isIdentifier(current)) return current.text === variableName
    const receiver = accessReceiver(current)
    return !!receiver && reference(receiver) !== undefined
  }
  const bind = (name: ts.BindingName, kind: DerivedReference): void => {
    if (ts.isIdentifier(name)) { aliases.set(name.text, kind); return }
    for (const element of name.elements) {
      if (ts.isOmittedExpression(element)) continue
      const member = element.dotDotDotToken ? kind : memberReference(kind,
        ts.isArrayBindingPattern(name) ? null : element.propertyName?.getText() ?? element.name.getText())
      if (member) bind(element.name, member)
    }
  }
  let mutated = false
  const visit = (node: ts.Node): void => {
    if (mutated) return
    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      const left = unwrapExpression(node.left)
      if (isMutationTarget(left)) mutated = true
      const kind = reference(node.right)
      if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken && kind) {
        if (ts.isIdentifier(left)) aliases.set(left.text, kind)
        if (ts.isObjectLiteralExpression(left)) {
          for (const property of left.properties) {
            const member = property.name && memberReference(kind, propertyNameText(property.name))
            if (!member) continue
            if (ts.isShorthandPropertyAssignment(property)) aliases.set(property.name.text, member)
            if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.initializer)) aliases.set(property.initializer.text, member)
          }
        }
      }
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const kind = reference(node.initializer)
      if (kind) bind(node.name, kind)
    }
    if (ts.isForOfStatement(node) && reference(node.expression) === 'array' && ts.isVariableDeclarationList(node.initializer)) {
      for (const declaration of node.initializer.declarations) bind(declaration.name, 'entry')
    }
    if ((ts.isDeleteExpression(node) && isMutationTarget(node.expression))
      || ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
        && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
        && isMutationTarget(node.operand))) mutated = true
    if (ts.isCallExpression(node)) {
      const target = invocationTarget(node.expression)
      const receiver = ['call', 'apply'].includes(accessName(node.expression) ?? '')
        ? node.arguments[0] : accessReceiver(target)
      if (receiver && LOG_MUTATORS.has(accessName(target) ?? '') && reference(receiver)) mutated = true
      if (isObjectAssignCall(node) && node.arguments[0] && reference(node.arguments[0])) mutated = true
    }
    ts.forEachChild(node, visit)
  }
  visit(block.body)
  return mutated
}

const isAllowedLogStoreAppend = (
  call: ts.CallExpression,
  block: FunctionBlock,
): boolean => {
  const declaration = findDerivedDeclaration(block, call, 'eventsToLogEntries')
  if (!declaration || !ts.isIdentifier(declaration.name)) return false
  return call.arguments.length === 1
    && isMapperEntryExpression(call.arguments[0], declaration.name.text)
    && !hasDerivedMutation(block, declaration.name.text)
}

const isAllowedLogCacheWriterCall = (
  rel: string,
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
  block: FunctionBlock,
): boolean => {
  if (call.arguments.length !== 2) return false
  const destination = call.arguments[0]?.getText(sourceFile)
  const logEntriesArg = call.arguments[1]?.getText(sourceFile)
  if (rel === 'shared/events/append.ts') {
    const declaration = findDerivedDeclaration(block, call, 'eventsToLogEntries')
    return destination === 'state' && !!declaration && ts.isIdentifier(declaration.name)
      && logEntriesArg === declaration.name.text && !hasDerivedMutation(block, declaration.name.text)
  }
  if (rel === 'shared/session/session-core.ts') {
    const entries = findDerivedDeclaration(block, call, 'this.engineLog.all')
    const toAdd = findDerivedDeclaration(block, call, 'entries.filter')
    return destination === 'this.state' && logEntriesArg === 'toAdd'
      && entries?.name.getText(sourceFile) === 'entries' && toAdd?.name.getText(sourceFile) === 'toAdd'
      && entries.getStart() < toAdd.getStart()
      && !hasDerivedMutation(block, 'entries') && !hasDerivedMutation(block, 'toAdd')
  }
  return false
}

const isAllowedStateLogWrite = (node: ts.Node, sourceFile: ts.SourceFile, block: FunctionBlock): boolean =>
  ts.isCallExpression(node)
  && node.expression.getText(sourceFile) === 'state.log.unshift'
  && node.arguments.length === 1
  && isMapperEntryExpression(node.arguments[0], 'entries')
  && !hasDerivedMutation(block, 'entries')

const isAllowedLogStoreConstructor = (node: ts.Node, sourceFile: ts.SourceFile): boolean => {
  const assignment = node.parent
  return ts.isNewExpression(node)
    && (node.arguments?.length ?? 0) === 0
    && ts.isBinaryExpression(assignment)
    && assignment.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && assignment.right === node
    && assignment.left.getText(sourceFile) === 'this.engineLog'
    && ts.isExpressionStatement(assignment.parent)
    && ts.isBlock(assignment.parent.parent)
    && ts.isConstructorDeclaration(assignment.parent.parent.parent)
}

const isAliasScope = (node: ts.Node): boolean =>
  ts.isSourceFile(node) || ts.isBlock(node) || ts.isFunctionLike(node)
  || ts.isCatchClause(node) || ts.isForStatement(node) || ts.isForOfStatement(node)
  || ts.isForInStatement(node) || ts.isCaseBlock(node)

const scanFile = (repoRoot: string, fullPath: string, hits: Set<LogExemption>): DirectSessionLogViolation[] => {
  const rel = path.relative(repoRoot, fullPath).replaceAll(path.sep, '/')
  const sourceFile = parseSource(fullPath)
  sourceRoots.set(sourceFile, repoRoot)
  if (SKIP_FILE_PATTERNS.some((pattern) => pattern.test(rel))) return []
  const source = sourceFile.text
  const exemptions = logExemptions.filter(exemption => exemption.file === rel)
    .map(exemption => ({ exemption, block: findFunctionBlock(sourceFile, exemption.functionName) }))
  const violations: DirectSessionLogViolation[] = []
  const {
    logStoreClassNames,
    logStoreClassNamespaces,
    logCacheWriterNames,
    logCacheWriterNamespaces,
  } = collectImportedIdentifiers(sourceFile)
  const addViolation = (node: ts.Node, kind: DirectSessionLogViolationKind): void => {
    let owner = node.parent
    while (owner && !ts.isFunctionLike(owner)) owner = owner.parent
    const index = node.getStart(sourceFile)
    const match = exemptions.find(({ exemption, block }) =>
      exemption.kind === kind && block && owner === block.body.parent && index >= block.start && index < block.end
      && ((kind === 'state-log-write' && isAllowedStateLogWrite(node, sourceFile, block))
        || (kind === 'log-store-constructor' && isAllowedLogStoreConstructor(node, sourceFile))
        || (ts.isCallExpression(node)
          && (kind === 'log-store-append'
            ? isAllowedLogStoreAppend(node, block)
            : kind === 'log-cache-writer-call' && isAllowedLogCacheWriterCall(rel, node, sourceFile, block)))))
    if (match) {
      hits.add(match.exemption)
      return
    }
    const line = lineNumberForIndex(source, node.getStart(sourceFile))
    violations.push({ file: rel, line, kind, text: lineText(source, line) })
  }

  const visit = (
    node: ts.Node,
    stateLikeNames: ReadonlySet<string>,
    stateLogAliases: ReadonlySet<string>,
    logStoreAliases: ReadonlySet<string>,
    logCacheWriterAliases: ReadonlySet<string>,
    logStoreConstructorAliases: ReadonlySet<string>,
    cacheNamespaces: Set<string>,
    storeNamespaces: Set<string>,
  ): void => {
    let scopedCacheNamespaces = cacheNamespaces
    let scopedStoreNamespaces = storeNamespaces
    let scopedStateLikeNames = stateLikeNames
    let scopedStateLogAliases = stateLogAliases
    let scopedLogStoreAliases = logStoreAliases
    let scopedLogCacheWriterAliases = logCacheWriterAliases
    let scopedLogStoreConstructorAliases = logStoreConstructorAliases
    if (isAliasScope(node)) {
      scopedCacheNamespaces = new Set(cacheNamespaces)
      scopedStoreNamespaces = new Set(storeNamespaces)
      scopedStateLikeNames = new Set(stateLikeNames)
      scopedStateLogAliases = new Set(stateLogAliases)
      scopedLogStoreAliases = new Set(logStoreAliases)
      scopedLogCacheWriterAliases = new Set(logCacheWriterAliases)
      scopedLogStoreConstructorAliases = new Set(logStoreConstructorAliases)
      if (ts.isFunctionLike(node)) {
        for (const parameter of node.parameters) {
          const names: string[] = []
          collectBindingNames(parameter.name, names)
          for (const name of names) {
            scopedCacheNamespaces.delete(name)
            scopedStoreNamespaces.delete(name)
            ;(scopedStateLikeNames as Set<string>).delete(name)
            ;(scopedStateLogAliases as Set<string>).delete(name)
            ;(scopedLogStoreAliases as Set<string>).delete(name)
            ;(scopedLogCacheWriterAliases as Set<string>).delete(name)
            ;(scopedLogStoreConstructorAliases as Set<string>).delete(name)
          }
          if (ts.isIdentifier(parameter.name) && includesGameStateType(parameter.type, sourceFile)) {
            ;(scopedStateLikeNames as Set<string>).add(parameter.name.text)
          }
        }
      }
    }

    const isStoreValue = (expression: ts.Expression): boolean => {
      const current = unwrapExpression(expression)
      return isLogStoreExpression(current, scopedLogStoreAliases)
        || (ts.isNewExpression(current) && isLogStoreConstructorExpression(
          current.expression, logStoreClassNames, scopedStoreNamespaces, scopedLogStoreConstructorAliases,
        ))
    }

    if (ts.isClassDeclaration(node) && node.name && node.heritageClauses?.some(
      clause => clause.token === ts.SyntaxKind.ExtendsKeyword && clause.types.some(type => isLogStoreConstructorExpression(
        type.expression, logStoreClassNames, scopedStoreNamespaces, scopedLogStoreConstructorAliases,
      )),
    )) (scopedLogStoreConstructorAliases as Set<string>).add(node.name.text)

    if (ts.isVariableDeclaration(node)) {
      const names: string[] = []
      collectBindingNames(node.name, names)
      for (const name of names) {
        scopedCacheNamespaces.delete(name)
        scopedStoreNamespaces.delete(name)
        ;(scopedStateLikeNames as Set<string>).delete(name)
        ;(scopedStateLogAliases as Set<string>).delete(name)
        ;(scopedLogStoreAliases as Set<string>).delete(name)
        ;(scopedLogCacheWriterAliases as Set<string>).delete(name)
        ;(scopedLogStoreConstructorAliases as Set<string>).delete(name)
      }
      if (node.initializer) {
        if (ts.isIdentifier(node.name) && isLogCacheNamespace(node.initializer, scopedCacheNamespaces)) {
          scopedCacheNamespaces.add(node.name.text)
        }
        if (ts.isIdentifier(node.name) && isLogStoreNamespace(node.initializer, scopedStoreNamespaces)) {
          scopedStoreNamespaces.add(node.name.text)
        }
        if (ts.isIdentifier(node.name)
          && (includesGameStateType(node.type, sourceFile)
            || isGameStateExpression(node.initializer, sourceFile))) {
          ;(scopedStateLikeNames as Set<string>).add(node.name.text)
        }
        if (ts.isIdentifier(node.name) && isStateLogExpression(node.initializer, scopedStateLikeNames)) {
          ;(scopedStateLogAliases as Set<string>).add(node.name.text)
        }
        if (ts.isIdentifier(node.name) && isStoreValue(node.initializer)) {
          ;(scopedLogStoreAliases as Set<string>).add(node.name.text)
        }
        if (ts.isIdentifier(node.name)
          && cacheWriterCallName(
            node.initializer,
            logCacheWriterNames,
            scopedCacheNamespaces,
            scopedLogCacheWriterAliases,
          )) {
          ;(scopedLogCacheWriterAliases as Set<string>).add(node.name.text)
        }
        if (ts.isIdentifier(node.name)
          && isLogStoreConstructorAliasSource(
            node.initializer,
            logStoreClassNames,
            scopedStoreNamespaces,
            scopedLogStoreConstructorAliases,
          )) {
          ;(scopedLogStoreConstructorAliases as Set<string>).add(node.name.text)
        }
        if (ts.isObjectBindingPattern(node.name) && isStateLikeExpression(node.initializer, scopedStateLikeNames)) {
          for (const element of node.name.elements) {
            if (ts.isOmittedExpression(element)) continue
            const property = element.propertyName
            const bindingName = element.name
            const sourceName = property ? propertyNameText(property) : ts.isIdentifier(bindingName) ? bindingName.text : null
            if (sourceName === 'log' && ts.isIdentifier(bindingName)) {
              ;(scopedStateLogAliases as Set<string>).add(bindingName.text)
            }
          }
        }
        if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            if (ts.isOmittedExpression(element)) continue
            const property = element.propertyName
            const bindingName = element.name
            if (!ts.isIdentifier(bindingName)) continue
            const sourceName = property ? propertyNameText(property) : bindingName.text
            if (sourceName && isLogStoreBindingSource(node.initializer, sourceName)) {
              ;(scopedLogStoreAliases as Set<string>).add(bindingName.text)
            }
            if (sourceName === 'prependDerivedLogEntries'
              && isLogCacheNamespace(node.initializer, scopedCacheNamespaces)) {
              ;(scopedLogCacheWriterAliases as Set<string>).add(bindingName.text)
            }
            if (sourceName === 'LogStore'
              && isLogStoreNamespace(node.initializer, scopedStoreNamespaces)) {
              ;(scopedLogStoreConstructorAliases as Set<string>).add(bindingName.text)
            }
          }
        }
      }
    }

    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(unwrapExpression(node.left))) {
      const name = (unwrapExpression(node.left) as ts.Identifier).text
      const facts = [
        [scopedCacheNamespaces, isLogCacheNamespace(node.right, scopedCacheNamespaces)],
        [scopedStoreNamespaces, isLogStoreNamespace(node.right, scopedStoreNamespaces)],
        [scopedStateLogAliases, isStateLogMutationTarget(node.right, scopedStateLikeNames, scopedStateLogAliases)],
        [scopedLogStoreAliases, isStoreValue(node.right)],
        [scopedLogCacheWriterAliases, !!cacheWriterCallName(node.right, logCacheWriterNames, scopedCacheNamespaces, scopedLogCacheWriterAliases)],
        [scopedLogStoreConstructorAliases, isLogStoreConstructorAliasSource(node.right, logStoreClassNames, scopedStoreNamespaces, scopedLogStoreConstructorAliases)],
      ] as const
      for (const [aliases, sensitive] of facts) {
        if (sensitive) (aliases as Set<string>).add(name)
        else (aliases as Set<string>).delete(name)
      }
    }

    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isObjectLiteralExpression(unwrapExpression(node.left))) {
      for (const name of objectLiteralAliasAssignments(node.left, 'log')) {
        ;(scopedStateLogAliases as Set<string>).delete(name)
        ;(scopedLogStoreAliases as Set<string>).delete(name)
        if (isStateLikeExpression(node.right, scopedStateLikeNames)) {
          ;(scopedStateLogAliases as Set<string>).add(name)
        }
        if (isLogStoreBindingSource(node.right, 'log')) {
          ;(scopedLogStoreAliases as Set<string>).add(name)
        }
      }
      for (const name of objectLiteralAliasAssignments(node.left, 'prependDerivedLogEntries')) {
        ;(scopedLogCacheWriterAliases as Set<string>).delete(name)
        if (isLogCacheNamespace(node.right, scopedCacheNamespaces)) {
          ;(scopedLogCacheWriterAliases as Set<string>).add(name)
        }
      }
      for (const name of objectLiteralAliasAssignments(node.left, 'LogStore')) {
        ;(scopedLogStoreConstructorAliases as Set<string>).delete(name)
        if (isLogStoreNamespace(node.right, scopedStoreNamespaces)) {
          ;(scopedLogStoreConstructorAliases as Set<string>).add(name)
        }
      }
    }

    if ((ts.isBinaryExpression(node)
        && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
        && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        && isStateLogMutationTarget(node.left, scopedStateLikeNames, scopedStateLogAliases))
      || (ts.isDeleteExpression(node) && isStateLogMutationTarget(node.expression, scopedStateLikeNames, scopedStateLogAliases))
      || ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
        && isStateLogMutationTarget(node.operand, scopedStateLikeNames, scopedStateLogAliases))) {
      addViolation(node, 'state-log-write')
    }

    if (ts.isNewExpression(node)
      && isLogStoreConstructorExpression(
        node.expression,
        logStoreClassNames,
        scopedStoreNamespaces,
        scopedLogStoreConstructorAliases,
      )
      && !allowedTestLogStoreConstructor(rel)) {
      addViolation(node, 'log-store-constructor')
    }

    if (ts.isCallExpression(node)) {
      const target = invocationTarget(node.expression)
      const calleeName = accessName(target)
      const receiver = ['call', 'apply'].includes(accessName(node.expression) ?? '')
        ? node.arguments[0] : accessReceiver(target)
      if (calleeName
        && LOG_MUTATORS.has(calleeName)
        && receiver
        && (isStateLogMutationTarget(receiver, scopedStateLikeNames, scopedStateLogAliases)
          || isStateLogReceiverText(receiver, scopedStateLikeNames, sourceFile))) {
        addViolation(node, 'state-log-write')
      }
      if (isObjectAssignCall(node)
        && !!node.arguments[0]
        && (isStateLogMutationTarget(node.arguments[0]!, scopedStateLikeNames, scopedStateLogAliases)
          || isObjectAssignStateLogWrite(node, scopedStateLikeNames))) {
        addViolation(node, 'state-log-write')
      }
      if (calleeName === 'append'
        && receiver
        && isStoreValue(receiver)) {
        addViolation(node, 'log-store-append')
      }
      if (cacheWriterCallName(
        target,
        logCacheWriterNames,
        scopedCacheNamespaces,
        scopedLogCacheWriterAliases,
      )
        && !allowedTestLogCacheWriterCall(rel)) {
        addViolation(node, 'log-cache-writer-call')
      }
    }

    ts.forEachChild(node, (child) => visit(
      child,
      scopedStateLikeNames,
      scopedStateLogAliases,
      scopedLogStoreAliases,
      scopedLogCacheWriterAliases,
      scopedLogStoreConstructorAliases,
      scopedCacheNamespaces,
      scopedStoreNamespaces,
    ))
    if (isAliasScope(node) && !ts.isSourceFile(node) && !ts.isFunctionLike(node) && !ts.isFunctionLike(node.parent)) {
      const localNames: string[] = []
      const collectLocals = (child: ts.Node): void => {
        if (isAliasScope(child)) return
        if (ts.isVariableDeclaration(child)) collectBindingNames(child.name, localNames)
        if (ts.isClassDeclaration(child) && child.name) localNames.push(child.name.text)
        ts.forEachChild(child, collectLocals)
      }
      ts.forEachChild(node, collectLocals)
      for (const [scoped, outer] of [
        [scopedCacheNamespaces, cacheNamespaces],
        [scopedStoreNamespaces, storeNamespaces],
        [scopedStateLikeNames, stateLikeNames],
        [scopedStateLogAliases, stateLogAliases],
        [scopedLogStoreAliases, logStoreAliases],
        [scopedLogCacheWriterAliases, logCacheWriterAliases],
        [scopedLogStoreConstructorAliases, logStoreConstructorAliases],
      ] as const) {
        for (const name of scoped) {
          if (!localNames.includes(name)) (outer as Set<string>).add(name)
        }
      }
    }
  }
  visit(sourceFile, new Set(['state']), new Set(), new Set(), new Set(), new Set(), logCacheWriterNamespaces, logStoreClassNamespaces)

  return violations
}

export const findDirectSessionLogViolations = (repoRoot: string): DirectSessionLogViolation[] => {
  const files = SCAN_DIRS.flatMap(dir => {
    const sources = walkSourceFiles(path.join(repoRoot, dir))
    if (sources.length === 0) throw new Error(`empty required source root: ${dir}`)
    return sources
  })
  const hits = new Set<LogExemption>()
  const violations = files.flatMap(file => scanFile(repoRoot, file, hits))
  for (const exemption of logExemptions) {
    if (!hits.has(exemption)) violations.push({
      file: exemption.file,
      line: 1,
      kind: 'stale-exemption',
      text: `${exemption.functionName}: no legal ${exemption.kind} exemption used; ${exemption.reason}`,
    })
  }
  return violations
}

if (process.argv[1] && process.argv[1].endsWith('check-direct-session-log.ts')) {
  const repoRoot = path.resolve(__dirname, '..')
  const violations = findDirectSessionLogViolations(repoRoot)
  if (violations.length === 0) {
    console.log('[check-direct-session-log] no direct session log writes found')
    process.exit(0)
  }
  console.error(`[check-direct-session-log] ${violations.length} violations:`)
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line} [${violation.kind}] ${violation.text}`)
  }
  process.exit(1)
}
