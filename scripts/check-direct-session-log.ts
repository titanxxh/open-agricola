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
  while (ts.isParenthesizedExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)) {
    current = current.expression
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

/** Repository modules are always imported by relative path; bare package specifiers never classify. */
const normalizeRelativeSpecifier = (specifier: string): string | null =>
  specifier.startsWith('.') ? specifier.replace(sourceExtensions, '').replace(/\/index$/, '') : null

const isLogCacheModule = (specifier: string): boolean => {
  const normalized = normalizeRelativeSpecifier(specifier)
  return normalized !== null
    && (normalized === './log-cache'
      || normalized.endsWith('/log-cache')
      || normalized === '../events'
      || normalized.endsWith('/shared/events'))
}

const isEngineModule = (specifier: string): boolean => {
  const normalized = normalizeRelativeSpecifier(specifier)
  return normalized !== null
    && (normalized === './log-store'
      || normalized.endsWith('/log-store')
      || normalized === './engine'
      || normalized === '../engine'
      || normalized.endsWith('/engine'))
}

const moduleRequestSpecifier = (expression: ts.Expression | undefined): string | null => {
  if (!expression) return null
  let current = unwrapExpression(expression)
  if (ts.isAwaitExpression(current)) current = unwrapExpression(current.expression)
  if (!ts.isCallExpression(current)) return null
  const callee = unwrapExpression(current.expression)
  const isRequire = ts.isIdentifier(callee) && callee.text === 'require'
  if (!isRequire && callee.kind !== ts.SyntaxKind.ImportKeyword) return null
  const argument = current.arguments[0] && unwrapExpression(current.arguments[0])
  return argument && ts.isStringLiteralLike(argument) ? argument.text : null
}

const moduleMemberRequest = (
  expression: ts.Expression | undefined,
): { specifier: string; member: string } | null => {
  if (!expression) return null
  const current = unwrapExpression(expression)
  const receiver = accessReceiver(current)
  const member = accessName(current)
  const specifier = receiver ? moduleRequestSpecifier(receiver) : null
  return specifier && member ? { specifier, member } : null
}

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
}

const forkScope = (scope: Scope): Scope =>
  Object.fromEntries(Object.entries(scope).map(([key, names]) => [key, new Set(names)])) as Scope

const shadowName = (scope: Scope, name: string): void => {
  for (const names of Object.values(scope)) names.delete(name)
}

const bindModuleNamespace = (scope: Scope, localName: string, specifier: string): void => {
  if (isEngineModule(specifier)) scope.logStoreClassNamespaces.add(localName)
  if (isLogCacheModule(specifier)) scope.logCacheWriterNamespaces.add(localName)
}

const bindModuleMember = (scope: Scope, importedName: string, localName: string, specifier: string): void => {
  if (isEngineModule(specifier) && importedName === 'LogStore') scope.logStoreClassNames.add(localName)
  if (isLogCacheModule(specifier) && importedName === 'prependDerivedLogEntries') scope.logCacheWriterNames.add(localName)
}

const bindModuleRequest = (scope: Scope, name: ts.BindingName, initializer: ts.Expression): void => {
  const specifier = moduleRequestSpecifier(initializer)
  if (specifier && ts.isIdentifier(name)) bindModuleNamespace(scope, name.text, specifier)
  if (specifier && ts.isObjectBindingPattern(name)) {
    for (const element of name.elements) {
      if (!ts.isIdentifier(element.name)) continue
      const importedName = element.propertyName ? propertyNameText(element.propertyName) : element.name.text
      if (importedName) bindModuleMember(scope, importedName, element.name.text, specifier)
    }
  }
  const member = moduleMemberRequest(initializer)
  if (member && ts.isIdentifier(name)) bindModuleMember(scope, member.member, name.text, member.specifier)
  const source = unwrapExpression(initializer)
  if (ts.isIdentifier(source) && ts.isIdentifier(name)) {
    if (scope.logStoreClassNamespaces.has(source.text)) scope.logStoreClassNamespaces.add(name.text)
    if (scope.logCacheWriterNamespaces.has(source.text)) scope.logCacheWriterNamespaces.add(name.text)
  }
}

const createRootScope = (): Scope => ({
  stateLikeNames: new Set(['state']),
  stateLogAliases: new Set(),
  logStoreAliases: new Set(),
  logCacheWriterAliases: new Set(),
  logStoreConstructorAliases: new Set(),
  logStoreClassNames: new Set(['LogStore']),
  logStoreClassNamespaces: new Set(),
  logCacheWriterNames: new Set(),
  logCacheWriterNamespaces: new Set(),
})

/**
 * Every local declaration of a scope shadows inherited names before any closure in it is visited, and module
 * bindings are hoisted the same way, so closures declared before the binding still resolve it.
 */
const precollectScopeBindings = (scope: Scope, statements: readonly ts.Statement[], sourceFile: ts.SourceFile): void => {
  for (const statement of statements) {
    const names: string[] = []
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) collectBindingNames(declaration.name, names)
    }
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
      names.push(statement.name.text)
    }
    for (const name of names) shadowName(scope, name)
  }
  for (const statement of statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const namedBindings = statement.importClause?.namedBindings
      if (namedBindings && ts.isNamespaceImport(namedBindings)) {
        bindModuleNamespace(scope, namedBindings.name.text, statement.moduleSpecifier.text)
      }
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const specifier of namedBindings.elements) {
          bindModuleMember(scope, specifier.propertyName?.text ?? specifier.name.text, specifier.name.text, statement.moduleSpecifier.text)
        }
      }
    }
    if (ts.isImportEqualsDeclaration(statement)
      && ts.isExternalModuleReference(statement.moduleReference)
      && ts.isStringLiteralLike(statement.moduleReference.expression)) {
      bindModuleNamespace(scope, statement.name.text, statement.moduleReference.expression.text)
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!declaration.initializer) continue
        bindModuleRequest(scope, declaration.name, declaration.initializer)
        if (ts.isIdentifier(declaration.name)
          && (includesGameStateType(declaration.type, sourceFile)
            || isGameStateExpression(declaration.initializer, sourceFile))) {
          scope.stateLikeNames.add(declaration.name.text)
        }
      }
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

const isLogStoreConstructorExpression = (
  expression: ts.Expression,
  logStoreClassNames: ReadonlySet<string>,
  logStoreClassNamespaces: ReadonlySet<string>,
  logStoreConstructorAliases: ReadonlySet<string>,
): boolean => {
  const current = unwrapExpression(expression)
  if (ts.isIdentifier(current)) return logStoreClassNames.has(current.text) || logStoreConstructorAliases.has(current.text)
  const receiver = accessReceiver(current)
  const unwrappedReceiver = receiver && unwrapExpression(receiver)
  return accessName(current) === 'LogStore'
    && !!unwrappedReceiver
    && ts.isIdentifier(unwrappedReceiver)
    && logStoreClassNamespaces.has(unwrappedReceiver.text)
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
    && ts.isIdentifier(unwrappedReceiver)
    && logCacheWriterNamespaces.has(unwrappedReceiver.text)) {
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
  const visit = (node: ts.Node, inherited: Scope): void => {
    let scope = inherited
    if (ts.isSourceFile(node) || ts.isBlock(node) || ts.isFunctionLike(node) || ts.isCatchClause(node)
      || ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      scope = forkScope(inherited)
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
      if (ts.isSourceFile(node) || ts.isBlock(node)) precollectScopeBindings(scope, node.statements, sourceFile)
    }

    if (ts.isVariableDeclaration(node)) {
      const names: string[] = []
      collectBindingNames(node.name, names)
      for (const name of names) shadowName(scope, name)
      if (node.initializer) {
        bindModuleRequest(scope, node.name, node.initializer)
        if (ts.isIdentifier(node.name)
          && (includesGameStateType(node.type, sourceFile)
            || isGameStateExpression(node.initializer, sourceFile))) {
          scope.stateLikeNames.add(node.name.text)
        }
        if (ts.isIdentifier(node.name) && isStateLogExpression(node.initializer, scope.stateLikeNames)) {
          scope.stateLogAliases.add(node.name.text)
        }
        if (ts.isIdentifier(node.name) && isLogStoreExpression(node.initializer, scope.logStoreAliases)) {
          scope.logStoreAliases.add(node.name.text)
        }
        if (ts.isIdentifier(node.name)
          && cacheWriterCallName(
            node.initializer,
            scope.logCacheWriterNames,
            scope.logCacheWriterNamespaces,
            scope.logCacheWriterAliases,
          )) {
          scope.logCacheWriterAliases.add(node.name.text)
        }
        if (ts.isIdentifier(node.name)
          && isLogStoreConstructorAliasSource(
            node.initializer,
            scope.logStoreClassNames,
            scope.logStoreClassNamespaces,
            scope.logStoreConstructorAliases,
          )) {
          scope.logStoreConstructorAliases.add(node.name.text)
        }
        if (ts.isObjectBindingPattern(node.name) && isStateLikeExpression(node.initializer, scope.stateLikeNames)) {
          for (const element of node.name.elements) {
            if (ts.isOmittedExpression(element)) continue
            const property = element.propertyName
            const bindingName = element.name
            const sourceName = property ? propertyNameText(property) : ts.isIdentifier(bindingName) ? bindingName.text : null
            if (sourceName === 'log' && ts.isIdentifier(bindingName)) {
              scope.stateLogAliases.add(bindingName.text)
            }
          }
        }
        if (ts.isObjectBindingPattern(node.name)) {
          const namespace = ts.isIdentifier(unwrapExpression(node.initializer))
            ? (unwrapExpression(node.initializer) as ts.Identifier).text
            : null
          for (const element of node.name.elements) {
            if (ts.isOmittedExpression(element)) continue
            const property = element.propertyName
            const bindingName = element.name
            if (!ts.isIdentifier(bindingName)) continue
            const sourceName = property ? propertyNameText(property) : bindingName.text
            if (sourceName && isLogStoreBindingSource(node.initializer, sourceName)) {
              scope.logStoreAliases.add(bindingName.text)
            }
            if (sourceName === 'prependDerivedLogEntries'
              && namespace
              && scope.logCacheWriterNamespaces.has(namespace)) {
              scope.logCacheWriterAliases.add(bindingName.text)
            }
            if (sourceName === 'LogStore'
              && namespace
              && scope.logStoreClassNamespaces.has(namespace)) {
              scope.logStoreConstructorAliases.add(bindingName.text)
            }
          }
        }
      }
    }

    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(unwrapExpression(node.left))) {
      const target = unwrapExpression(node.left) as ts.Identifier
      bindModuleRequest(scope, target, node.right)
      if (isStateLogExpression(node.right, scope.stateLikeNames)) {
        scope.stateLogAliases.add(target.text)
      }
      if (isLogStoreExpression(node.right, scope.logStoreAliases)) {
        scope.logStoreAliases.add(target.text)
      }
      if (cacheWriterCallName(
        node.right,
        scope.logCacheWriterNames,
        scope.logCacheWriterNamespaces,
        scope.logCacheWriterAliases,
      )) {
        scope.logCacheWriterAliases.add(target.text)
      }
      if (isLogStoreConstructorAliasSource(
        node.right,
        scope.logStoreClassNames,
        scope.logStoreClassNamespaces,
        scope.logStoreConstructorAliases,
      )) {
        scope.logStoreConstructorAliases.add(target.text)
      }
    }

    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isObjectLiteralExpression(unwrapExpression(node.left))) {
      for (const name of objectLiteralAliasAssignments(node.left, 'log')) {
        if (isStateLikeExpression(node.right, scope.stateLikeNames)) {
          scope.stateLogAliases.add(name)
        }
        if (isLogStoreBindingSource(node.right, 'log')) {
          scope.logStoreAliases.add(name)
        }
      }
      const namespace = ts.isIdentifier(unwrapExpression(node.right))
        ? (unwrapExpression(node.right) as ts.Identifier).text
        : null
      for (const name of objectLiteralAliasAssignments(node.left, 'prependDerivedLogEntries')) {
        if (namespace && scope.logCacheWriterNamespaces.has(namespace)) {
          scope.logCacheWriterAliases.add(name)
        }
      }
      for (const name of objectLiteralAliasAssignments(node.left, 'LogStore')) {
        if (namespace && scope.logStoreClassNamespaces.has(namespace)) {
          scope.logStoreConstructorAliases.add(name)
        }
      }
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
      && isLogStoreConstructorExpression(
        node.expression,
        scope.logStoreClassNames,
        scope.logStoreClassNamespaces,
        scope.logStoreConstructorAliases,
      )
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
      if (cacheWriterCallName(
        node.expression,
        scope.logCacheWriterNames,
        scope.logCacheWriterNamespaces,
        scope.logCacheWriterAliases,
      )
        && rel !== 'shared/events/log-cache.ts'
        && !allowedTestLogCacheWriterCall(rel)
        && !isAllowedLogCacheWriterCall(rel, node, sourceFile)) {
        addViolation(node, 'log-cache-writer-call')
      }
    }

    ts.forEachChild(node, (child) => visit(child, scope))
  }
  visit(sourceFile, createRootScope())

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
