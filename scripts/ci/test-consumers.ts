import { lstatSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { isAbsolute, relative, resolve } from 'node:path'
import ts from 'typescript'
import { parseSource, sourceExtensions } from '../source-files'
import type { TestInventory } from './verification-plan'

export type TestConsumerIndex = {
  inventoryKey: string
  tests: Array<{
    file: string
    dependencies: string[]
    symbols: string[]
    literals: string[]
    uncertaintyReasons: string[]
  }>
  expansionReasons: string[]
}

type ModuleEvidence = {
  dependencies: Set<string>
  helpers: Set<string>
  symbols: Set<string>
  literals: Set<string>
  uncertaintyReasons: Set<string>
}
type ModuleRead = { kind: 'source'; evidence: ModuleEvidence } | { kind: 'failure'; reason: string }

const normalize = (file: string) => file.replaceAll('\\', '/')
const testLocal = (file: string) => /(?:^|\/)(?:__tests__|_helpers|fixtures|__fixtures__)(?:\/|\.)|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)
  || /^(?:tests|e2e-tests)\//.test(file)
const builtins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]))
const failure = (error: unknown) => error instanceof Error ? error.message : String(error)
const options: ts.CompilerOptions = {
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  module: ts.ModuleKind.ESNext,
  allowJs: true,
  allowImportingTsExtensions: true,
  resolveJsonModule: true,
}

/** Follows test-local modules only; production modules are recorded without inspecting their imports. */
export function readTestConsumerIndex(cwd: string, inventory: TestInventory): TestConsumerIndex {
  const index: TestConsumerIndex = { inventoryKey: JSON.stringify(inventory), tests: [], expansionReasons: [] }
  const root = resolve(cwd)
  const files = [...new Set([...inventory.vitest.map(test => test.file), ...inventory.browser])]
  const testFiles = new Set(files)
  const modules = new Map<string, ModuleRead>()
  const resolutionCache = ts.createModuleResolutionCache(root, normalize, options)
  const expansionReasons = new Set<string>()
  const repositoryPath = (absolute: string) => {
    const file = normalize(relative(root, absolute))
    if (file === '..' || file.startsWith('../') || isAbsolute(file)) throw new Error(`Test dependency escapes repository: ${absolute}`)
    return file
  }
  const inspect = (file: string): ModuleRead => {
    const cached = modules.get(file)
    if (cached) return cached
    const evidence: ModuleEvidence = {
      dependencies: new Set(), helpers: new Set(), symbols: new Set(), literals: new Set(), uncertaintyReasons: new Set(),
    }
    try {
      const absolute = resolve(root, file)
      repositoryPath(absolute)
      if (!lstatSync(absolute).isFile()) throw new Error(`Test dependency must be a regular file: ${file}`)
      const source = parseSource(absolute)
      const dependency = (specifier: string) => {
        if (builtins.has(specifier)) return
        const resolved = ts.resolveModuleName(specifier, absolute, options, ts.sys, resolutionCache).resolvedModule
        if (!resolved) {
          evidence.uncertaintyReasons.add(`Unresolved module consumer in ${file}: ${specifier}`)
          return
        }
        if (resolved.isExternalLibraryImport || /(?:^|[\\/])node_modules[\\/]/.test(resolved.resolvedFileName)) return
        const target = repositoryPath(resolved.resolvedFileName)
        evidence.dependencies.add(target)
        if (!sourceExtensions.test(target)) evidence.uncertaintyReasons.add(`Non-source fixture consumer in ${file}: ${target}`)
        else if (testFiles.has(target) || testLocal(target)) evidence.helpers.add(target)
      }
      const literalDependency = (node: ts.Expression | undefined) => {
        if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) dependency(node.text)
        else evidence.uncertaintyReasons.add(`Computed module consumer: ${file}`)
      }
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node)) {
          evidence.symbols.add(node.text)
          if (/^(?:readFile(?:Sync)?|readdir(?:Sync)?|glob(?:Sync)?|createReadStream)$/.test(node.text)) {
            evidence.uncertaintyReasons.add(`Filesystem or glob consumer: ${file}`)
          }
          if (node.text === 'createRequire') evidence.uncertaintyReasons.add(`Unknown module loader consumer: ${file}`)
          if (node.text === 'require' && !(ts.isCallExpression(node.parent) && node.parent.expression === node)
            && !ts.isExternalModuleReference(node.parent)) evidence.uncertaintyReasons.add(`Indirect module consumer: ${file}`)
        }
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) evidence.literals.add(node.text)
        if (ts.isImportDeclaration(node)) literalDependency(node.moduleSpecifier)
        if (ts.isExportDeclaration(node) && node.moduleSpecifier) literalDependency(node.moduleSpecifier)
        if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) literalDependency(node.moduleReference.expression)
        if (ts.isCallExpression(node)) {
          if (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')) literalDependency(node.arguments[0])
          if (ts.isPropertyAccessExpression(node.expression) && (/^(?:glob|globSync)$/.test(node.expression.name.text)
            || (node.expression.name.text === 'context' && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'require'))) {
            evidence.uncertaintyReasons.add(`Computed module or fixture consumer: ${file}`)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
      const result: ModuleRead = { kind: 'source', evidence }
      modules.set(file, result)
      return result
    } catch (error) {
      const result: ModuleRead = { kind: 'failure', reason: `Cannot inspect test consumer evidence ${file}: ${failure(error)}` }
      modules.set(file, result)
      return result
    }
  }
  for (const file of files) {
    const dependencies = new Set<string>()
    const symbols = new Set<string>()
    const literals = new Set<string>()
    const uncertaintyReasons = new Set<string>()
    const visited = new Set<string>()
    const traverse = (target: string): void => {
      if (visited.has(target)) return
      visited.add(target)
      dependencies.add(target)
      const module = inspect(target)
      if (module.kind === 'failure') {
        expansionReasons.add(module.reason)
        return
      }
      module.evidence.dependencies.forEach(dependency => dependencies.add(dependency))
      module.evidence.symbols.forEach(symbol => symbols.add(symbol))
      module.evidence.literals.forEach(literal => literals.add(literal))
      module.evidence.uncertaintyReasons.forEach(reason => uncertaintyReasons.add(reason))
      module.evidence.helpers.forEach(traverse)
    }
    traverse(file)
    index.tests.push({ file, dependencies: [...dependencies].sort(), symbols: [...symbols].sort(), literals: [...literals].sort(), uncertaintyReasons: [...uncertaintyReasons].sort() })
  }
  index.expansionReasons = [...expansionReasons].sort()
  return index
}
