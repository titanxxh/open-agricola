import { existsSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import ts from 'typescript'
import { parseSource, sourceExtensions, walkSourceFiles } from '../source-files'

export const CARD_REGISTRIES = [
  'shared/cards/register-all.ts',
  'shared/cards/catalog.generated.ts',
  'shared/cards/major/generated.ts',
  'shared/cards/major/runtime.generated.ts',
] as const

export type IncompleteEvidence = { file: string; reason: string }

export type ImportGraph = {
  dependents: Map<string, Set<string>>
  imports: Map<string, Set<string>>
  literals: Map<string, Set<string>>
  keysByModule: Map<string, Set<string>>
  incomplete: IncompleteEvidence[]
}

const normalize = (file: string) => file.split(/[\\/]/).join('/')

function importIsTypeOnly(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause
  if (!clause) return false
  if (clause.isTypeOnly) return true
  if (clause.name) return false
  const bindings = clause.namedBindings
  if (!bindings || !ts.isNamedImports(bindings) || bindings.elements.length === 0) return false
  return bindings.elements.every(element => element.isTypeOnly)
}

function exportIsTypeOnly(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true
  if (!node.exportClause || !ts.isNamedExports(node.exportClause) || node.exportClause.elements.length === 0) return false
  return node.exportClause.elements.every(element => element.isTypeOnly)
}

function propertyName(name: ts.PropertyName): string | null {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name) ? name.text : null
}

function bindingReference(expression: ts.Expression, bindings: ReadonlyMap<string, string>): string | null {
  if (ts.isIdentifier(expression)) return bindings.has(expression.text) ? expression.text : null
  if (ts.isPropertyAccessExpression(expression) || ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)
    || ts.isTypeAssertionExpression(expression) || ts.isNonNullExpression(expression)) {
    return bindingReference(expression.expression, bindings)
  }
  return null
}

function registryKeys(source: ts.SourceFile, absolute: string, root: string): Map<string, Set<string>> {
  const bindings = new Map<string, string>()
  const keys = new Map<string, Set<string>>()
  const addKey = (target: string, key: string) => {
    const current = keys.get(target) ?? new Set<string>()
    current.add(key)
    keys.set(target, current)
  }
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && !importIsTypeOnly(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const target = resolveSpecifier(node.moduleSpecifier.text, absolute, root)
      const clause = node.importClause
      if (target && clause && !clause.isTypeOnly) {
        if (clause.name) bindings.set(clause.name.text, target)
        if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) bindings.set(clause.namedBindings.name.text, target)
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            if (!element.isTypeOnly) bindings.set(element.name.text, target)
          }
        }
      }
    } else if (ts.isShorthandPropertyAssignment(node)) {
      const target = bindings.get(node.name.text)
      if (target) addKey(target, node.name.text)
    } else if (ts.isPropertyAssignment(node)) {
      const binding = bindingReference(node.initializer, bindings)
      const target = binding ? bindings.get(binding) : undefined
      const key = propertyName(node.name)
      if (target && key) addKey(target, key)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return keys
}

function classifySpecifier(specifier: string, fromFile: string, root: string): { target: string | null; unresolved: boolean } {
  if (isBuiltin(specifier)) return { target: null, unresolved: false }
  const resolved = ts.resolveModuleName(specifier, fromFile, {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true,
    resolveJsonModule: true,
  }, ts.sys).resolvedModule?.resolvedFileName
  if (resolved?.includes('node_modules')) return { target: null, unresolved: false }
  const inside = (candidate: string) => {
    const target = normalize(relative(root, candidate))
    return target.startsWith('..') ? null : target
  }
  if (resolved) {
    const target = inside(resolved)
    if (target) return { target, unresolved: false }
  }
  if (specifier.startsWith('.')) {
    const candidate = resolve(dirname(fromFile), specifier)
    if (existsSync(candidate)) {
      const target = inside(candidate)
      if (target) return { target, unresolved: false }
    }
  }
  return { target: null, unresolved: true }
}

function resolveSpecifier(specifier: string, fromFile: string, root: string): string | null {
  return classifySpecifier(specifier, fromFile, root).target
}

export function readImportGraph(root: string): ImportGraph {
  const dependents = new Map<string, Set<string>>()
  const imports = new Map<string, Set<string>>()
  const literals = new Map<string, Set<string>>()
  const keysByModule = new Map<string, Set<string>>()
  const incomplete: IncompleteEvidence[] = []
  const seenIncomplete = new Set<string>()
  const note = (file: string, reason: string) => {
    const key = `${file}\0${reason}`
    if (seenIncomplete.has(key)) return
    seenIncomplete.add(key)
    incomplete.push({ file, reason })
  }
  const add = (from: string, to: string) => {
    const importers = dependents.get(to) ?? new Set<string>()
    importers.add(from)
    dependents.set(to, importers)
    const outgoing = imports.get(from) ?? new Set<string>()
    outgoing.add(to)
    imports.set(from, outgoing)
  }
  const addLiteral = (from: string, value: string) => {
    const values = literals.get(from) ?? new Set<string>()
    values.add(value)
    literals.set(from, values)
  }
  for (const absolute of walkSourceFiles(root, sourceExtensions, true, 'skip-non-source')) {
    const from = normalize(relative(root, absolute))
    let source: ts.SourceFile
    try {
      source = parseSource(absolute)
    } catch {
      note(from, 'source file cannot be parsed')
      continue
    }
    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteralLike(node)) addLiteral(from, node.text)
      const specifier = ts.isImportDeclaration(node) && !importIsTypeOnly(node) ? node.moduleSpecifier
        : ts.isExportDeclaration(node) && !exportIsTypeOnly(node) ? node.moduleSpecifier
          : undefined
      if (specifier && ts.isStringLiteralLike(specifier)) {
        const classified = classifySpecifier(specifier.text, absolute, root)
        if (classified.target) add(from, classified.target)
        else if (classified.unresolved) note(from, `unresolved import '${specifier.text}'`)
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const argument = node.arguments[0]
        if (argument && ts.isStringLiteralLike(argument)) {
          const classified = classifySpecifier(argument.text, absolute, root)
          if (classified.target) add(from, classified.target)
          else if (classified.unresolved) note(from, `unresolved import '${argument.text}'`)
        } else note(from, 'unresolved import')
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    if ((CARD_REGISTRIES as readonly string[]).includes(from)) {
      for (const [modulePath, keys] of registryKeys(source, absolute, root)) {
        const current = keysByModule.get(modulePath) ?? new Set<string>()
        for (const key of keys) current.add(key)
        keysByModule.set(modulePath, current)
      }
    }
  }
  return { dependents, imports, literals, keysByModule, incomplete }
}
