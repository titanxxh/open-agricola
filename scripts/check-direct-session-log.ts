import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

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
const SCAN_EXTS = new Set(['.ts', '.tsx'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git'])
const SKIP_FILE_PATTERNS = [
  /^scripts\/check-direct-session-log\.ts$/,
  /^scripts\/__tests__\/check-direct-session-log\.test\.ts$/,
]

const allowedLogStoreConstructorFiles = new Set([
  'shared/session/session-core.ts',
])

const allowedLogAppendFunctionsByFile: Record<string, readonly string[]> = {
  'shared/engine/engine.ts': ['flushEventTransaction'],
  'shared/engine/engine-proceed.ts': ['appendDerivedLogsForEventOnlyResult'],
  'shared/engine/engine-resolve.ts': ['appendDerivedLogsForEventOnlyResult'],
}

const allowedLogCacheWriterFunctionsByFile: Record<string, readonly string[]> = {
  'shared/events/append.ts': ['appendImmediateEvents'],
  'shared/session/session-core.ts': ['flushEngineLog'],
}

const MAPPER_ASSIGNMENT_SOURCE = String.raw`\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*eventsToLogEntries\s*\(`
const mapperAssignmentRegex = (flags = ''): RegExp => new RegExp(MAPPER_ASSIGNMENT_SOURCE, flags)

type FunctionBlock = {
  start: number
  end: number
  source: string
}

const walkDir = (dir: string, repoRoot: string, out: string[]): void => {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDir(full, repoRoot, out)
      continue
    }
    if (SCAN_EXTS.has(path.extname(entry.name))) out.push(full)
  }
}

const lineNumberForIndex = (source: string, index: number): number =>
  source.slice(0, index).split('\n').length

const lineText = (source: string, line: number): string =>
  source.split('\n')[line - 1]?.trim() ?? ''

const allowedTestLogStoreConstructor = (file: string): boolean =>
  file.includes('/__tests__/') || file.endsWith('.test.ts')

const allowedTestLogCacheWriterCall = (file: string): boolean =>
  file.includes('/__tests__/') || file.endsWith('.test.ts')

const findFunctionBlock = (
  source: string,
  functionName: string,
): FunctionBlock | null => {
  const sourceFile = ts.createSourceFile('scan.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
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

const allowedLogStoreAppendBlocks = (rel: string, source: string): FunctionBlock[] => {
  const allowedFunctions = allowedLogAppendFunctionsByFile[rel]
  if (!allowedFunctions) return []
  return allowedFunctions.flatMap((functionName) => {
    const block = findFunctionBlock(source, functionName)
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

const isLogCacheModule = (specifier: string): boolean =>
  specifier === './log-cache'
  || specifier.endsWith('/log-cache')
  || specifier.endsWith('/log-cache.ts')
  || specifier === '../events'
  || specifier === '../events.ts'
  || specifier.endsWith('/shared/events')
  || specifier.endsWith('/shared/events.ts')
  || specifier.endsWith('/shared/events/index')
  || specifier.endsWith('/shared/events/index.ts')

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
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const clause = statement.importClause
    const namedBindings = clause?.namedBindings
    if (!namedBindings) continue
    if (ts.isNamespaceImport(namedBindings)) {
      logStoreClassNamespaces.add(namedBindings.name.text)
    }
    if (isLogCacheModule(statement.moduleSpecifier.text) && ts.isNamespaceImport(namedBindings)) {
      logCacheWriterNamespaces.add(namedBindings.name.text)
      continue
    }
    if (!ts.isNamedImports(namedBindings)) continue
    for (const specifier of namedBindings.elements) {
      const importedName = specifier.propertyName?.text ?? specifier.name.text
      if (importedName === 'LogStore') logStoreClassNames.add(specifier.name.text)
      if (isLogCacheModule(statement.moduleSpecifier.text) && importedName === 'prependDerivedLogEntries') {
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
  source: string,
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
  source: string,
  sourceFile: ts.SourceFile,
): boolean => {
  const allowedFunctions = allowedLogCacheWriterFunctionsByFile[rel]
  if (!allowedFunctions) return false
  return allowedFunctions.some((functionName) => {
    const block = findFunctionBlock(source, functionName)
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

const isAllowedStateLogWrite = (rel: string, node: ts.Node, source: string, sourceFile: ts.SourceFile): boolean => {
  if (rel !== 'shared/events/log-cache.ts') return false
  const block = findFunctionBlock(source, 'prependDerivedLogEntries')
  const index = node.getStart(sourceFile)
  return !!block && index >= block.start && index < block.end
}

const scanFile = (repoRoot: string, fullPath: string): DirectSessionLogViolation[] => {
  const rel = path.relative(repoRoot, fullPath).replaceAll(path.sep, '/')
  if (SKIP_FILE_PATTERNS.some((pattern) => pattern.test(rel))) return []
  const source = fs.readFileSync(fullPath, 'utf8')
  const sourceFile = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const violations: DirectSessionLogViolation[] = []
  const {
    logStoreClassNames,
    logStoreClassNamespaces,
    logCacheWriterNames,
    logCacheWriterNamespaces,
  } = collectImportedIdentifiers(sourceFile)
  const addViolation = (node: ts.Node, kind: DirectSessionLogViolationKind): void => {
    const line = lineNumberForIndex(source, node.getStart(sourceFile))
    violations.push({ file: rel, line, kind, text: lineText(source, line) })
  }

  const allowedBlocks = allowedLogStoreAppendBlocks(rel, source)
  const visit = (
    node: ts.Node,
    stateLikeNames: ReadonlySet<string>,
    stateLogAliases: ReadonlySet<string>,
    logStoreAliases: ReadonlySet<string>,
    logCacheWriterAliases: ReadonlySet<string>,
    logStoreConstructorAliases: ReadonlySet<string>,
  ): void => {
    let scopedStateLikeNames = stateLikeNames
    let scopedStateLogAliases = stateLogAliases
    let scopedLogStoreAliases = logStoreAliases
    let scopedLogCacheWriterAliases = logCacheWriterAliases
    let scopedLogStoreConstructorAliases = logStoreConstructorAliases
    if (ts.isSourceFile(node) || ts.isBlock(node) || ts.isFunctionLike(node)) {
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
            ;(scopedStateLikeNames as Set<string>).delete(name)
            scopedStateLogAliases.delete(name)
            scopedLogStoreAliases.delete(name)
            scopedLogCacheWriterAliases.delete(name)
            scopedLogStoreConstructorAliases.delete(name)
          }
          if (ts.isIdentifier(parameter.name) && includesGameStateType(parameter.type, sourceFile)) {
            ;(scopedStateLikeNames as Set<string>).add(parameter.name.text)
          }
        }
      }
    }

    if (ts.isVariableDeclaration(node)) {
      const names: string[] = []
      collectBindingNames(node.name, names)
      for (const name of names) {
        ;(scopedStateLikeNames as Set<string>).delete(name)
        ;(scopedStateLogAliases as Set<string>).delete(name)
        ;(scopedLogStoreAliases as Set<string>).delete(name)
        ;(scopedLogCacheWriterAliases as Set<string>).delete(name)
        ;(scopedLogStoreConstructorAliases as Set<string>).delete(name)
      }
      if (node.initializer) {
        if (ts.isIdentifier(node.name)
          && (includesGameStateType(node.type, sourceFile)
            || isGameStateExpression(node.initializer, sourceFile))) {
          ;(scopedStateLikeNames as Set<string>).add(node.name.text)
        }
        if (ts.isIdentifier(node.name) && isStateLogExpression(node.initializer, scopedStateLikeNames)) {
          ;(scopedStateLogAliases as Set<string>).add(node.name.text)
        }
        if (ts.isIdentifier(node.name) && isLogStoreExpression(node.initializer, scopedLogStoreAliases)) {
          ;(scopedLogStoreAliases as Set<string>).add(node.name.text)
        }
        if (ts.isIdentifier(node.name)
          && cacheWriterCallName(
            node.initializer,
            logCacheWriterNames,
            logCacheWriterNamespaces,
            scopedLogCacheWriterAliases,
          )) {
          ;(scopedLogCacheWriterAliases as Set<string>).add(node.name.text)
        }
        if (ts.isIdentifier(node.name)
          && isLogStoreConstructorAliasSource(
            node.initializer,
            logStoreClassNames,
            logStoreClassNamespaces,
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
              ;(scopedLogStoreAliases as Set<string>).add(bindingName.text)
            }
            if (sourceName === 'prependDerivedLogEntries'
              && namespace
              && logCacheWriterNamespaces.has(namespace)) {
              ;(scopedLogCacheWriterAliases as Set<string>).add(bindingName.text)
            }
            if (sourceName === 'LogStore'
              && namespace
              && logStoreClassNamespaces.has(namespace)) {
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
      ;(scopedStateLogAliases as Set<string>).delete(name)
      ;(scopedLogStoreAliases as Set<string>).delete(name)
      ;(scopedLogCacheWriterAliases as Set<string>).delete(name)
      ;(scopedLogStoreConstructorAliases as Set<string>).delete(name)
      if (isStateLogExpression(node.right, scopedStateLikeNames)) {
        ;(scopedStateLogAliases as Set<string>).add(name)
      }
      if (isLogStoreExpression(node.right, scopedLogStoreAliases)) {
        ;(scopedLogStoreAliases as Set<string>).add(name)
      }
      if (cacheWriterCallName(
        node.right,
        logCacheWriterNames,
        logCacheWriterNamespaces,
        scopedLogCacheWriterAliases,
      )) {
        ;(scopedLogCacheWriterAliases as Set<string>).add(name)
      }
      if (isLogStoreConstructorAliasSource(
        node.right,
        logStoreClassNames,
        logStoreClassNamespaces,
        scopedLogStoreConstructorAliases,
      )) {
        ;(scopedLogStoreConstructorAliases as Set<string>).add(name)
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
      const namespace = ts.isIdentifier(unwrapExpression(node.right))
        ? (unwrapExpression(node.right) as ts.Identifier).text
        : null
      for (const name of objectLiteralAliasAssignments(node.left, 'prependDerivedLogEntries')) {
        ;(scopedLogCacheWriterAliases as Set<string>).delete(name)
        if (namespace && logCacheWriterNamespaces.has(namespace)) {
          ;(scopedLogCacheWriterAliases as Set<string>).add(name)
        }
      }
      for (const name of objectLiteralAliasAssignments(node.left, 'LogStore')) {
        ;(scopedLogStoreConstructorAliases as Set<string>).delete(name)
        if (namespace && logStoreClassNamespaces.has(namespace)) {
          ;(scopedLogStoreConstructorAliases as Set<string>).add(name)
        }
      }
    }

    if (!isAllowedStateLogWrite(rel, node, source, sourceFile)) {
      if ((ts.isBinaryExpression(node)
          && ts.isAssignmentOperator(node.operatorToken.kind)
          && isStateLogMutationTarget(node.left, scopedStateLikeNames, scopedStateLogAliases))
        || (ts.isDeleteExpression(node) && isStateLogMutationTarget(node.expression, scopedStateLikeNames, scopedStateLogAliases))
        || ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
          && isStateLogMutationTarget(node.operand, scopedStateLikeNames, scopedStateLogAliases))) {
        addViolation(node, 'state-log-write')
      }
    }

    if (ts.isNewExpression(node)
      && isLogStoreConstructorExpression(
        node.expression,
        logStoreClassNames,
        logStoreClassNamespaces,
        scopedLogStoreConstructorAliases,
      )
      && !allowedLogStoreConstructorFiles.has(rel)
      && !allowedTestLogStoreConstructor(rel)) {
      addViolation(node, 'log-store-constructor')
    }

    if (ts.isCallExpression(node)) {
      const calleeName = accessName(node.expression)
      const receiver = accessReceiver(node.expression)
      if (!isAllowedStateLogWrite(rel, node, source, sourceFile)
        && calleeName
        && LOG_MUTATORS.has(calleeName)
        && receiver
        && (isStateLogMutationTarget(receiver, scopedStateLikeNames, scopedStateLogAliases)
          || isStateLogReceiverText(receiver, scopedStateLikeNames, sourceFile))) {
        addViolation(node, 'state-log-write')
      }
      if (!isAllowedStateLogWrite(rel, node, source, sourceFile)
        && isObjectAssignCall(node)
        && !!node.arguments[0]
        && (isStateLogMutationTarget(node.arguments[0]!, scopedStateLikeNames, scopedStateLogAliases)
          || isObjectAssignStateLogWrite(node, scopedStateLikeNames))) {
        addViolation(node, 'state-log-write')
      }
      if (calleeName === 'append'
        && receiver
        && isLogStoreExpression(receiver, scopedLogStoreAliases)
        && !isAllowedLogStoreAppend(node, source, sourceFile, allowedBlocks)) {
        addViolation(node, 'log-store-append')
      }
      if (cacheWriterCallName(
        node.expression,
        logCacheWriterNames,
        logCacheWriterNamespaces,
        scopedLogCacheWriterAliases,
      )
        && rel !== 'shared/events/log-cache.ts'
        && !allowedTestLogCacheWriterCall(rel)
        && !isAllowedLogCacheWriterCall(rel, node, source, sourceFile)) {
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
    ))
  }
  visit(sourceFile, new Set(['state']), new Set(), new Set(), new Set(), new Set())

  return violations
}

export const findDirectSessionLogViolations = (repoRoot: string): DirectSessionLogViolation[] => {
  const files: string[] = []
  for (const dir of SCAN_DIRS) walkDir(path.join(repoRoot, dir), repoRoot, files)
  return files.flatMap((file) => scanFile(repoRoot, file))
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
