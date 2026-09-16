import fs from 'node:fs'
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

export type DirectSessionLogViolation = {
  file: string
  line: number
  kind: DirectSessionLogViolationKind
  text: string
}

const SCAN_DIRS = ['shared', 'server', 'scripts']

type FunctionException = { functions: readonly string[]; reason: string }

const skippedFiles: Record<string, string> = {
  'scripts/check-direct-session-log.ts': 'The guard itself spells out the forbidden write patterns',
  'scripts/__tests__/check-direct-session-log.test.ts': 'Regression fixtures contain forbidden writes as source strings',
}

const allowedLogStoreConstructorFiles: Record<string, string> = {
  'shared/session/session-core.ts': 'GameCore owns the single engine LogStore',
}

const allowedLogAppendFunctionsByFile: Record<string, FunctionException> = {
  'shared/engine/engine.ts': {
    functions: ['flushEventTransaction'],
    reason: 'Flushes mapper output of committed events into the engine LogStore',
  },
  'shared/engine/engine-proceed.ts': {
    functions: ['appendDerivedLogsForEventOnlyResult'],
    reason: 'Appends mapper output for event-only proceed results',
  },
  'shared/engine/engine-resolve.ts': {
    functions: ['appendDerivedLogsForEventOnlyResult'],
    reason: 'Appends mapper output for event-only resolve results',
  },
}

const allowedLogCacheWriterFunctionsByFile: Record<string, FunctionException> = {
  'shared/events/append.ts': {
    functions: ['appendImmediateEvents'],
    reason: 'Writes mapper output of immediate events into the log cache',
  },
  'shared/session/session-core.ts': {
    functions: ['flushEngineLog'],
    reason: 'Flushes engine LogStore entries into the log cache',
  },
}

const allowedStateLogWriteFunctionsByFile: Record<string, FunctionException> = {
  'shared/events/log-cache.ts': {
    functions: ['prependDerivedLogEntries'],
    reason: 'The named log cache writer is the only state.log mutation site',
  },
}

const MAPPER_ASSIGNMENT_SOURCE = String.raw`\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*eventsToLogEntries\s*\(`
const mapperAssignmentRegex = (flags = ''): RegExp => new RegExp(MAPPER_ASSIGNMENT_SOURCE, flags)

type FunctionBlock = {
  start: number
  end: number
  source: string
}

const scanRootFiles = (repoRoot: string): string[] =>
  SCAN_DIRS.flatMap((dir) => {
    const full = path.join(repoRoot, dir)
    const stats = fs.lstatSync(full, { throwIfNoEntry: false })
    if (stats?.isSymbolicLink()) throw new Error(`scan root symlink requires explicit ownership: ${dir}`)
    if (!stats?.isDirectory()) throw new Error(`missing scan root: ${dir}`)
    return walkSourceFiles(full)
  })

const lineNumberForIndex = (source: string, index: number): number =>
  source.slice(0, index).split('\n').length

const lineText = (source: string, line: number): string =>
  source.split('\n')[line - 1]?.trim() ?? ''

const TEST_FILE_PATTERN = /(?:^|\/)__tests__\/|\.(?:test|spec)\.[cm]?[jt]sx?$/

const allowedTestLogStoreConstructor = (file: string): boolean => TEST_FILE_PATTERN.test(file)

const allowedTestLogCacheWriterCall = (file: string): boolean => TEST_FILE_PATTERN.test(file)

const findFunctionBlock = (
  sourceFile: ts.SourceFile,
  functionName: string,
): FunctionBlock | null => {
  let block: FunctionBlock | null = null
  const fromBody = (body: ts.Block): FunctionBlock => ({
    start: body.getStart(sourceFile),
    end: body.getEnd(),
    source: body.getText(sourceFile),
  })
  const visit = (node: ts.Node): void => {
    if (block) return
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

const allowedLogStoreAppendBlocks = (rel: string, sourceFile: ts.SourceFile): FunctionBlock[] => {
  const allowedFunctions = allowedLogAppendFunctionsByFile[rel]?.functions
  if (!allowedFunctions) return []
  return allowedFunctions.flatMap((functionName) => {
    const block = findFunctionBlock(sourceFile, functionName)
    if (!block) return []
    const mapperAssignment = mapperAssignmentRegex().exec(block.source)
    return mapperAssignment ? [block] : []
  })
}

const escapedRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const mapperResultMutationPattern = (variableName: string): RegExp => {
  const variable = escapedRegExp(variableName)
  const assignment = String.raw`(?:[-+*/%&|?]{0,2}=(?!=)|\+\+|--)`
  const propertyChain = String.raw`(?:!?\s*(?:\.\s*[A-Za-z_$][\w$]*|\[[^\]]+\]))+`
  const entryAccess = String.raw`(?:\[[^\]]+\]|\.\s*at\s*\([^)]*\))\s*!?`
  const objectAssignTarget = String.raw`${variable}\s*(?:${entryAccess})?(?:${propertyChain})?`
  return new RegExp(
    String.raw`\b${variable}\s*(?:${assignment}|${entryAccess}\s*(?:${assignment}|${propertyChain}\s*${assignment})|\.length\s*${assignment}|\.(?:copyWithin|fill|pop|push|reverse|shift|sort|splice|unshift)\s*\()|\bObject\.assign\s*\(\s*${objectAssignTarget}\s*,|\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*${variable}\s*${entryAccess}[\s\S]*?\b\1${propertyChain}\s*${assignment}|\b(?:const|let)\s*\[\s*([A-Za-z_$][\w$]*)[^\]]*\]\s*(?::[^=]+)?=\s*${variable}\b[\s\S]*?\b\2${propertyChain}\s*${assignment}|\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*${variable}\b(?!\s*[.\[])[\s\S]*?\b\3\s*(?:${assignment}|${entryAccess}\s*${assignment}|\.length\s*${assignment}|\.(?:copyWithin|fill|pop|push|reverse|shift|sort|splice|unshift)\s*\()`,
  )
}

const LOG_MUTATORS = new Set(['copyWithin', 'fill', 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'])
const GAME_STATE_FACTORY_NAMES = new Set(['createInitialState', 'normalizeState', 'rebuildActiveModifiers'])

const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  let current = expression
  for (;;) {
    if (ts.isParenthesizedExpression(current)
      || ts.isNonNullExpression(current)
      || ts.isAsExpression(current)
      || ts.isTypeAssertionExpression(current)) {
      current = current.expression
    } else if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      current = current.right
    } else {
      return current
    }
  }
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

type ModuleKind = 'log-cache' | 'engine'
type ModuleClassifier = (specifier: string) => ModuleKind | null

const REPOSITORY_MODULES: Record<string, ModuleKind> = {
  'shared/events': 'log-cache',
  'shared/events/log-cache': 'log-cache',
  'shared/engine': 'engine',
  'shared/engine/log-store': 'engine',
}

/** Relative specifiers are resolved against the importing file; bare package specifiers never classify. */
const createModuleClassifier = (repoRoot: string, fromFile: string): ModuleClassifier => (specifier) => {
  if (!specifier.startsWith('.')) return null
  const resolved = path.resolve(path.dirname(fromFile), specifier.replace(sourceExtensions, '')).replace(/\/index$/, '')
  return REPOSITORY_MODULES[path.relative(repoRoot, resolved).replaceAll(path.sep, '/')] ?? null
}

const isNodeModuleSpecifier = (specifier: string): boolean =>
  specifier === 'node:module' || specifier === 'module'

type Scope = {
  stateLikeNames: Set<string>
  stateLogAliases: Set<string>
  logStoreAliases: Set<string>
  logCacheWriterAliases: Set<string>
  logStoreConstructorAliases: Set<string>
  logStoreClassNames: Set<string>
  logStoreClassNamespaces: Set<string>
  logCacheWriterNames: Set<string>
  logCacheWriterNamespaces: Set<string>
  moduleLoaders: Set<string>
  requireFactories: Set<string>
  requireFactoryNamespaces: Set<string>
  classify: ModuleClassifier
}

const scopeSets = (scope: Scope): Set<string>[] =>
  Object.values(scope).filter((value): value is Set<string> => value instanceof Set)

const forkScope = (scope: Scope): Scope => ({
  ...scope,
  ...Object.fromEntries(
    Object.entries(scope)
      .filter(([, value]) => value instanceof Set)
      .map(([key, value]) => [key, new Set(value as Set<string>)]),
  ),
})

const shadowName = (scope: Scope, name: string): void => {
  for (const names of scopeSets(scope)) names.delete(name)
}

const createRootScope = (classify: ModuleClassifier): Scope => ({
  stateLikeNames: new Set(['state']),
  stateLogAliases: new Set(),
  logStoreAliases: new Set(),
  logCacheWriterAliases: new Set(),
  logStoreConstructorAliases: new Set(),
  logStoreClassNames: new Set(['LogStore']),
  logStoreClassNamespaces: new Set(),
  logCacheWriterNames: new Set(),
  logCacheWriterNamespaces: new Set(),
  moduleLoaders: new Set(['require']),
  requireFactories: new Set(),
  requireFactoryNamespaces: new Set(),
  classify,
})

/** `require('x')` through an unshadowed loader binding, or `await import('x')`. */
const moduleRequestSpecifier = (expression: ts.Expression | undefined, scope: Scope): string | null => {
  if (!expression) return null
  let current = unwrapExpression(expression)
  if (ts.isAwaitExpression(current)) current = unwrapExpression(current.expression)
  if (!ts.isCallExpression(current)) return null
  const callee = unwrapExpression(current.expression)
  const isLoader = ts.isIdentifier(callee) && scope.moduleLoaders.has(callee.text)
  if (!isLoader && callee.kind !== ts.SyntaxKind.ImportKeyword) return null
  const argument = current.arguments[0] && unwrapExpression(current.arguments[0])
  return argument && ts.isStringLiteralLike(argument) ? argument.text : null
}

/** `require('x').member`, `(await import('x')).member` or `require('x')['member']`. */
const moduleMemberRequest = (
  expression: ts.Expression | undefined,
  scope: Scope,
): { specifier: string; member: string } | null => {
  if (!expression) return null
  const current = unwrapExpression(expression)
  const receiver = accessReceiver(current)
  const member = accessName(current)
  const specifier = receiver ? moduleRequestSpecifier(receiver, scope) : null
  return specifier && member ? { specifier, member } : null
}

/** A call to `createRequire` imported from `node:module`, directly or through a namespace. */
const isCreateRequireCall = (expression: ts.Expression, scope: Scope): boolean => {
  const current = unwrapExpression(expression)
  if (!ts.isCallExpression(current)) return false
  const callee = unwrapExpression(current.expression)
  if (ts.isIdentifier(callee)) return scope.requireFactories.has(callee.text)
  const receiver = accessReceiver(callee)
  const unwrappedReceiver = receiver && unwrapExpression(receiver)
  return accessName(callee) === 'createRequire'
    && !!unwrappedReceiver
    && ts.isIdentifier(unwrappedReceiver)
    && scope.requireFactoryNamespaces.has(unwrappedReceiver.text)
}

/** `judge` answers what an expression means; `into` receives the resulting provenance. */
const bindModuleNamespace = (judge: Scope, into: Scope, localName: string, specifier: string): void => {
  const kind = judge.classify(specifier)
  if (kind === 'engine') into.logStoreClassNamespaces.add(localName)
  if (kind === 'log-cache') into.logCacheWriterNamespaces.add(localName)
  if (isNodeModuleSpecifier(specifier)) into.requireFactoryNamespaces.add(localName)
}

const bindModuleMember = (judge: Scope, into: Scope, importedName: string, localName: string, specifier: string): void => {
  const kind = judge.classify(specifier)
  if (kind === 'engine' && importedName === 'LogStore') into.logStoreClassNames.add(localName)
  if (kind === 'log-cache' && importedName === 'prependDerivedLogEntries') into.logCacheWriterNames.add(localName)
  if (isNodeModuleSpecifier(specifier) && importedName === 'createRequire') into.requireFactories.add(localName)
}

const bindModuleRequest = (judge: Scope, into: Scope, name: ts.BindingName, initializer: ts.Expression): void => {
  const specifier = moduleRequestSpecifier(initializer, judge)
  if (specifier && ts.isIdentifier(name)) bindModuleNamespace(judge, into, name.text, specifier)
  if (specifier && ts.isObjectBindingPattern(name)) {
    for (const element of name.elements) {
      if (!ts.isIdentifier(element.name)) continue
      const importedName = element.propertyName ? propertyNameText(element.propertyName) : element.name.text
      if (importedName) bindModuleMember(judge, into, importedName, element.name.text, specifier)
    }
  }
  const member = moduleMemberRequest(initializer, judge)
  if (member && ts.isIdentifier(name)) bindModuleMember(judge, into, member.member, name.text, member.specifier)
  const source = unwrapExpression(initializer)
  if (ts.isIdentifier(source) && ts.isIdentifier(name)) {
    if (judge.logStoreClassNamespaces.has(source.text)) into.logStoreClassNamespaces.add(name.text)
    if (judge.logCacheWriterNamespaces.has(source.text)) into.logCacheWriterNamespaces.add(name.text)
    if (judge.requireFactoryNamespaces.has(source.text)) into.requireFactoryNamespaces.add(name.text)
  }
  if (ts.isIdentifier(name) && isCreateRequireCall(initializer, judge)) into.moduleLoaders.add(name.text)
}

const isVarDeclarationList = (list: ts.VariableDeclarationList): boolean =>
  (list.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const | ts.NodeFlags.Using | ts.NodeFlags.AwaitUsing)) === 0

/** `var` declarations nested in blocks and control flow, excluding nested functions and classes, hoist to the function. */
const collectHoistedVarStatements = (node: ts.Node, out: ts.VariableStatement[]): void => {
  ts.forEachChild(node, (child) => {
    if (ts.isFunctionLike(child) || ts.isClassLike(child)) return
    if (ts.isVariableStatement(child) && isVarDeclarationList(child.declarationList)) out.push(child)
    collectHoistedVarStatements(child, out)
  })
}

const bindImportStatement = (judge: Scope, into: Scope, statement: ts.Statement): void => {
  if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
    const namedBindings = statement.importClause?.namedBindings
    if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      bindModuleNamespace(judge, into, namedBindings.name.text, statement.moduleSpecifier.text)
    }
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const specifier of namedBindings.elements) {
        bindModuleMember(judge, into, specifier.propertyName?.text ?? specifier.name.text, specifier.name.text, statement.moduleSpecifier.text)
      }
    }
  }
  if (ts.isImportEqualsDeclaration(statement)
    && ts.isExternalModuleReference(statement.moduleReference)
    && ts.isStringLiteralLike(statement.moduleReference.expression)) {
    bindModuleNamespace(judge, into, statement.name.text, statement.moduleReference.expression.text)
  }
}

/**
 * Every local declaration of a scope shadows inherited names before any closure in it is visited; imports are
 * bound first because ESM hoists them, then declared provenance (module bindings and aliases derived from
 * them) is hoisted the same way, so closures declared before the binding still resolve it. Function-level
 * scopes additionally hoist nested `var` declarations.
 */
const precollectScopeBindings = (
  scope: Scope,
  statements: readonly ts.Statement[],
  sourceFile: ts.SourceFile,
  hoistedVars: readonly ts.VariableStatement[] = [],
): void => {
  const declarations = [...statements, ...hoistedVars]
  for (const statement of declarations) {
    const names: string[] = []
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) collectBindingNames(declaration.name, names)
    }
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
      names.push(statement.name.text)
    }
    for (const name of names) shadowName(scope, name)
  }
  for (const statement of statements) bindImportStatement(scope, scope, statement)
  for (const statement of declarations) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.initializer) bindDeclaration(scope, scope, declaration, sourceFile)
    }
  }
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
    && (ts.isThis(unwrappedReceiver)
      || (ts.isIdentifier(unwrappedReceiver) && unwrappedReceiver.text === 'int'))
}

const isLogStoreBindingSource = (
  expression: ts.Expression,
  propertyName: string,
): boolean => {
  const current = unwrapExpression(expression)
  if (propertyName === 'engineLog') return ts.isThis(current)
  return propertyName === 'log'
    && (ts.isThis(current) || (ts.isIdentifier(current) && current.text === 'int'))
}

const isLogStoreConstructorExpression = (expression: ts.Expression, scope: Scope): boolean => {
  const current = unwrapExpression(expression)
  if (ts.isIdentifier(current)) {
    return scope.logStoreClassNames.has(current.text) || scope.logStoreConstructorAliases.has(current.text)
  }
  if (accessName(current) !== 'LogStore') return false
  const receiver = accessReceiver(current)
  const unwrappedReceiver = receiver && unwrapExpression(receiver)
  if (unwrappedReceiver && ts.isIdentifier(unwrappedReceiver)) return scope.logStoreClassNamespaces.has(unwrappedReceiver.text)
  const inlineSpecifier = receiver ? moduleRequestSpecifier(receiver, scope) : null
  return inlineSpecifier !== null && scope.classify(inlineSpecifier) === 'engine'
}

const isMapperEntryExpression = (expression: ts.Expression | undefined, variableName: string): boolean => {
  if (!expression) return false
  const current = unwrapExpression(expression)
  return ts.isElementAccessExpression(current)
    && ts.isIdentifier(unwrapExpression(current.expression))
    && (unwrapExpression(current.expression) as ts.Identifier).text === variableName
}

const cacheWriterCallName = (expression: ts.Expression, scope: Scope): string | null => {
  const current = unwrapExpression(expression)
  if (ts.isIdentifier(current)) {
    return scope.logCacheWriterAliases.has(current.text) || scope.logCacheWriterNames.has(current.text) ? current.text : null
  }
  if (accessName(current) !== 'prependDerivedLogEntries') return null
  const receiver = accessReceiver(current)
  const unwrappedReceiver = receiver && unwrapExpression(receiver)
  if (unwrappedReceiver && ts.isIdentifier(unwrappedReceiver)) {
    return scope.logCacheWriterNamespaces.has(unwrappedReceiver.text) ? 'prependDerivedLogEntries' : null
  }
  const inlineSpecifier = receiver ? moduleRequestSpecifier(receiver, scope) : null
  return inlineSpecifier !== null && scope.classify(inlineSpecifier) === 'log-cache' ? 'prependDerivedLogEntries' : null
}

const bindDeclaration = (judge: Scope, into: Scope, declaration: ts.VariableDeclaration, sourceFile: ts.SourceFile): void => {
  const initializer = declaration.initializer
  if (!initializer) return
  const name = declaration.name
  bindModuleRequest(judge, into, name, initializer)
  if (ts.isIdentifier(name)) {
    if (includesGameStateType(declaration.type, sourceFile) || isGameStateExpression(initializer, sourceFile)) {
      into.stateLikeNames.add(name.text)
    }
    if (isStateLogExpression(initializer, judge.stateLikeNames)) into.stateLogAliases.add(name.text)
    if (isLogStoreExpression(initializer, judge.logStoreAliases)) into.logStoreAliases.add(name.text)
    if (cacheWriterCallName(initializer, judge)) into.logCacheWriterAliases.add(name.text)
    if (isLogStoreConstructorExpression(initializer, judge)) into.logStoreConstructorAliases.add(name.text)
    return
  }
  if (!ts.isObjectBindingPattern(name)) return
  const stateLike = isStateLikeExpression(initializer, judge.stateLikeNames)
  const source = unwrapExpression(initializer)
  const namespace = ts.isIdentifier(source) ? source.text : null
  for (const element of name.elements) {
    if (!ts.isIdentifier(element.name)) continue
    const sourceName = element.propertyName ? propertyNameText(element.propertyName) : element.name.text
    if (!sourceName) continue
    if (stateLike && sourceName === 'log') into.stateLogAliases.add(element.name.text)
    if (isLogStoreBindingSource(initializer, sourceName)) into.logStoreAliases.add(element.name.text)
    if (sourceName === 'prependDerivedLogEntries' && namespace && judge.logCacheWriterNamespaces.has(namespace)) {
      into.logCacheWriterAliases.add(element.name.text)
    }
    if (sourceName === 'LogStore' && namespace && judge.logStoreClassNamespaces.has(namespace)) {
      into.logStoreConstructorAliases.add(element.name.text)
    }
  }
}

/**
 * Assignments never introduce a binding, so their provenance is written to every scope on the chain: the
 * assigned variable belongs to some enclosing scope and a forbidden call after the branch must still resolve it.
 */
const bindAssignment = (chain: readonly Scope[], target: ts.Identifier, right: ts.Expression): void => {
  const judge = chain[chain.length - 1]!
  for (const into of chain) {
    bindModuleRequest(judge, into, target, right)
    if (isStateLogExpression(right, judge.stateLikeNames)) into.stateLogAliases.add(target.text)
    if (isLogStoreExpression(right, judge.logStoreAliases)) into.logStoreAliases.add(target.text)
    if (cacheWriterCallName(right, judge)) into.logCacheWriterAliases.add(target.text)
    if (isLogStoreConstructorExpression(right, judge)) into.logStoreConstructorAliases.add(target.text)
  }
}

const bindObjectAssignment = (chain: readonly Scope[], left: ts.Expression, right: ts.Expression): void => {
  const judge = chain[chain.length - 1]!
  const source = unwrapExpression(right)
  const namespace = ts.isIdentifier(source) ? source.text : null
  const specifier = moduleRequestSpecifier(right, judge)
  for (const into of chain) {
    for (const name of objectLiteralAliasAssignments(left, 'log')) {
      if (isStateLikeExpression(right, judge.stateLikeNames)) into.stateLogAliases.add(name)
      if (isLogStoreBindingSource(right, 'log')) into.logStoreAliases.add(name)
    }
    for (const name of objectLiteralAliasAssignments(left, 'prependDerivedLogEntries')) {
      if (namespace && judge.logCacheWriterNamespaces.has(namespace)) into.logCacheWriterAliases.add(name)
      if (specifier) bindModuleMember(judge, into, 'prependDerivedLogEntries', name, specifier)
    }
    for (const name of objectLiteralAliasAssignments(left, 'LogStore')) {
      if (namespace && judge.logStoreClassNamespaces.has(namespace)) into.logStoreConstructorAliases.add(name)
      if (specifier) bindModuleMember(judge, into, 'LogStore', name, specifier)
    }
  }
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
    if (ts.isPropertyAssignment(property) && propertyNameText(property.name) === propertyName) {
      const target = assignmentTargetIdentifier(property.initializer)
      if (target) names.push(target.text)
    }
  }
  return names
}

/** `target` or `target = fallback` inside a destructuring assignment pattern. */
const assignmentTargetIdentifier = (expression: ts.Expression): ts.Identifier | null => {
  const current = unwrapExpression(expression)
  if (ts.isIdentifier(current)) return current
  if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    const left = unwrapExpression(current.left)
    return ts.isIdentifier(left) ? left : null
  }
  return null
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

const isAllowedLogStoreAppend = (
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
  blocks: readonly FunctionBlock[],
): boolean =>
  blocks.some((block) => {
    const matchIndex = call.expression.getStart(sourceFile)
    if (matchIndex < block.start || matchIndex >= block.end) return false
    const localAppendIndex = matchIndex - block.start
    const mapperAssignments = [...block.source.matchAll(mapperAssignmentRegex('g'))]
      .filter((match) => match.index < localAppendIndex)
    const mapperAssignment = mapperAssignments.at(-1)
    if (!mapperAssignment?.[1]) return false
    const prefix = block.source.slice(
      mapperAssignment.index + mapperAssignment[0].length,
      localAppendIndex,
    )
    if (mapperResultMutationPattern(mapperAssignment[1]).test(prefix)) return false
    return isMapperEntryExpression(call.arguments[0], mapperAssignment[1])
  })

const isAllowedLogCacheWriterCall = (
  rel: string,
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
): boolean => {
  const allowedFunctions = allowedLogCacheWriterFunctionsByFile[rel]?.functions
  if (!allowedFunctions) return false
  return allowedFunctions.some((functionName) => {
    const block = findFunctionBlock(sourceFile, functionName)
    const matchIndex = call.expression.getStart(sourceFile)
    if (!block || matchIndex < block.start || matchIndex >= block.end) return false
    const localCallIndex = matchIndex - block.start
    const logEntriesArg = call.arguments[1]?.getText(sourceFile).trim()
    if (rel === 'shared/events/append.ts') {
      const mapperAssignment = mapperAssignmentRegex().exec(block.source)
      if (!mapperAssignment?.[1] || mapperAssignment.index >= localCallIndex) return false
      const prefix = block.source.slice(
        mapperAssignment.index + mapperAssignment[0].length,
        localCallIndex,
      )
      return logEntriesArg === mapperAssignment[1]
        && !mapperResultMutationPattern(mapperAssignment[1]).test(prefix)
    }
    if (rel === 'shared/session/session-core.ts') {
      const entriesAssignment = /\bconst\s+entries\s*=\s*this\.engineLog\.all\s*\(\s*\)/.exec(block.source)
      const toAddAssignment = /\bconst\s+toAdd\s*=\s*entries\.filter\s*\(/.exec(block.source)
      if (!entriesAssignment || !toAddAssignment || toAddAssignment.index >= localCallIndex) return false
      const entriesPrefix = block.source.slice(
        entriesAssignment.index + entriesAssignment[0].length,
        localCallIndex,
      )
      const prefix = block.source.slice(
        toAddAssignment.index + toAddAssignment[0].length,
        localCallIndex,
      )
      return logEntriesArg === 'toAdd'
        && entriesAssignment.index < toAddAssignment.index
        && !mapperResultMutationPattern('entries').test(entriesPrefix)
        && !mapperResultMutationPattern('toAdd').test(prefix)
    }
    return false
  })
}

const isAllowedStateLogWrite = (rel: string, node: ts.Node, sourceFile: ts.SourceFile): boolean => {
  const allowedFunctions = allowedStateLogWriteFunctionsByFile[rel]?.functions
  if (!allowedFunctions) return false
  const index = node.getStart(sourceFile)
  return allowedFunctions.some((functionName) => {
    const block = findFunctionBlock(sourceFile, functionName)
    return !!block && index >= block.start && index < block.end
  })
}

const scanFile = (repoRoot: string, fullPath: string): DirectSessionLogViolation[] => {
  const rel = path.relative(repoRoot, fullPath).replaceAll(path.sep, '/')
  if (skippedFiles[rel]) return []
  const sourceFile = parseSource(fullPath)
  const source = sourceFile.text
  const violations: DirectSessionLogViolation[] = []
  const addViolation = (node: ts.Node, kind: DirectSessionLogViolationKind): void => {
    const line = lineNumberForIndex(source, node.getStart(sourceFile))
    violations.push({ file: rel, line, kind, text: lineText(source, line) })
  }

  const allowedBlocks = allowedLogStoreAppendBlocks(rel, sourceFile)
  const isFunctionBody = (node: ts.Node): boolean =>
    ts.isSourceFile(node) || (ts.isBlock(node) && !!node.parent && ts.isFunctionLike(node.parent))
  const visit = (node: ts.Node, inheritedChain: readonly Scope[]): void => {
    let chain = inheritedChain
    let scope = chain[chain.length - 1]!
    if (ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node) || ts.isCaseBlock(node)
      || ts.isFunctionLike(node) || ts.isCatchClause(node)
      || ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      scope = forkScope(scope)
      chain = [...chain, scope]
      if (ts.isFunctionLike(node)) {
        for (const parameter of node.parameters) {
          const names: string[] = []
          collectBindingNames(parameter.name, names)
          for (const name of names) shadowName(scope, name)
          if (ts.isIdentifier(parameter.name) && includesGameStateType(parameter.type, sourceFile)) {
            scope.stateLikeNames.add(parameter.name.text)
          }
        }
      }
      if (ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node)) {
        const hoistedVars: ts.VariableStatement[] = []
        if (isFunctionBody(node)) collectHoistedVarStatements(node, hoistedVars)
        precollectScopeBindings(scope, node.statements, sourceFile, hoistedVars.filter((statement) => statement.parent !== node))
      }
      if (ts.isCaseBlock(node)) {
        precollectScopeBindings(scope, node.clauses.flatMap((clause) => [...clause.statements]), sourceFile)
      }
    }

    if (ts.isVariableDeclaration(node)) {
      const names: string[] = []
      collectBindingNames(node.name, names)
      for (const name of names) shadowName(scope, name)
      bindDeclaration(scope, scope, node, sourceFile)
    }

    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = unwrapExpression(node.left)
      if (ts.isIdentifier(left)) bindAssignment(chain, left, node.right)
      if (ts.isObjectLiteralExpression(left)) bindObjectAssignment(chain, left, node.right)
    }

    if (!isAllowedStateLogWrite(rel, node, sourceFile)) {
      if ((ts.isBinaryExpression(node)
          && ts.isAssignmentOperator(node.operatorToken.kind)
          && isStateLogMutationTarget(node.left, scope.stateLikeNames, scope.stateLogAliases))
        || (ts.isDeleteExpression(node) && isStateLogMutationTarget(node.expression, scope.stateLikeNames, scope.stateLogAliases))
        || ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
          && isStateLogMutationTarget(node.operand, scope.stateLikeNames, scope.stateLogAliases))) {
        addViolation(node, 'state-log-write')
      }
    }

    if (ts.isNewExpression(node)
      && isLogStoreConstructorExpression(node.expression, scope)
      && !allowedLogStoreConstructorFiles[rel]
      && !allowedTestLogStoreConstructor(rel)) {
      addViolation(node, 'log-store-constructor')
    }

    if (ts.isCallExpression(node)) {
      const calleeName = accessName(node.expression)
      const receiver = accessReceiver(node.expression)
      if (!isAllowedStateLogWrite(rel, node, sourceFile)
        && calleeName
        && LOG_MUTATORS.has(calleeName)
        && receiver
        && (isStateLogMutationTarget(receiver, scope.stateLikeNames, scope.stateLogAliases)
          || isStateLogReceiverText(receiver, scope.stateLikeNames, sourceFile))) {
        addViolation(node, 'state-log-write')
      }
      if (!isAllowedStateLogWrite(rel, node, sourceFile)
        && isObjectAssignCall(node)
        && !!node.arguments[0]
        && (isStateLogMutationTarget(node.arguments[0]!, scope.stateLikeNames, scope.stateLogAliases)
          || isObjectAssignStateLogWrite(node, scope.stateLikeNames))) {
        addViolation(node, 'state-log-write')
      }
      if (calleeName === 'append'
        && receiver
        && isLogStoreExpression(receiver, scope.logStoreAliases)
        && !isAllowedLogStoreAppend(node, sourceFile, allowedBlocks)) {
        addViolation(node, 'log-store-append')
      }
      if (cacheWriterCallName(node.expression, scope)
        && rel !== 'shared/events/log-cache.ts'
        && !allowedTestLogCacheWriterCall(rel)
        && !isAllowedLogCacheWriterCall(rel, node, sourceFile)) {
        addViolation(node, 'log-cache-writer-call')
      }
    }

    ts.forEachChild(node, (child) => visit(child, chain))
  }
  visit(sourceFile, [createRootScope(createModuleClassifier(repoRoot, fullPath))])

  return violations
}

export const findDirectSessionLogViolations = (repoRoot: string): DirectSessionLogViolation[] =>
  scanRootFiles(repoRoot).flatMap((file) => scanFile(repoRoot, file))

type ExceptionSite = { file: string; functionName?: string; reason: string }

const exceptionSites = (): ExceptionSite[] => [
  ...Object.entries(skippedFiles).map(([file, reason]) => ({ file, reason })),
  ...Object.entries(allowedLogStoreConstructorFiles).map(([file, reason]) => ({ file, reason })),
  ...[allowedLogAppendFunctionsByFile, allowedLogCacheWriterFunctionsByFile, allowedStateLogWriteFunctionsByFile]
    .flatMap((table) => Object.entries(table))
    .flatMap(([file, { functions, reason }]) => functions.map((functionName) => ({ file, functionName, reason }))),
]

export const findStaleDirectSessionLogExceptions = (repoRoot: string): string[] =>
  exceptionSites().flatMap(({ file, functionName, reason }) => {
    const full = path.join(repoRoot, file)
    const label = functionName ? `${file}#${functionName}` : file
    const exists = fs.statSync(full, { throwIfNoEntry: false })?.isFile() ?? false
    const stale = !reason
      || !exists
      || (!!functionName && !findFunctionBlock(parseSource(full), functionName))
    return stale ? [`stale direct session log exception: ${label}`] : []
  })

if (process.argv[1] && process.argv[1].endsWith('check-direct-session-log.ts')) {
  const repoRoot = path.resolve(__dirname, '..')
  const staleExceptions = findStaleDirectSessionLogExceptions(repoRoot)
  if (staleExceptions.length > 0) {
    console.error(`[check-direct-session-log] ${staleExceptions.length} stale exceptions:`)
    for (const entry of staleExceptions) console.error(`  ${entry}`)
    process.exit(1)
  }
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
