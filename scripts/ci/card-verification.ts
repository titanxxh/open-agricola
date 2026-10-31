import { lstatSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { parseCardFile } from '../build-cards-manifest'
import { parseSource, walkSourceFiles } from '../source-files'
import type { ChangedPath, PlannedCheck, TestInventory } from './verification-plan'

type Association = { file: string; cardIds: string[]; safetyReasons: string[] }
export type CardAssociationIndex = {
  sources: Array<{ file: string; cardIds: string[]; broadFootprint: boolean }>
  tests: Association[]
  inventoryKey: string
  expansionReasons: string[]
}

const normalize = (file: string) => file.replaceAll('\\', '/')
const cardKey = (id: string) => id.replace(/_impl$/, '').replace(/^([A-Z]+)0*(\d+)_/, (_, deck: string, number: string) => `${deck}${Number(number)}_`)
const testLocal = (file: string) => /(?:^|\/)(?:__tests__|_helpers|fixtures|__fixtures__)(?:\/|\.)|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) || /^(?:tests|e2e-tests)\//.test(file)
const bootstrap = new Set(['shared/cards/__tests__/setup-register-all.ts', 'shared/cards/__tests__/card-environment.ts'])
const cardUiSafety = new Set(['card-localization', 'choice-previews', 'farm-card-targets', 'frontend-browser-scenario-matrix'].map(name => `e2e-tests/${name}.spec.ts`))
const inventoryKey = (inventory: TestInventory) => JSON.stringify(inventory)
const failure = (error: unknown) => error instanceof Error ? error.message : String(error)

/** Reads test evidence only. Production imports terminate traversal, except for Card Source identity. */
export function readCardAssociationIndex(cwd: string, inventory: TestInventory): CardAssociationIndex {
  const index: CardAssociationIndex = { sources: [], tests: [], inventoryKey: inventoryKey(inventory), expansionReasons: [] }
  const canonical = new Map<string, string>()
  try {
    for (const absolute of walkSourceFiles(join(cwd, 'shared/cards'))) {
      const file = normalize(relative(cwd, absolute))
      if (!/^shared\/cards\/(?:[A-Z]+|major|community)\/[^/]+\.ts$/.test(file)) continue
      const source = parseSource(absolute)
      const cardIds = parseCardFile(absolute, { includeLegacyConstructors: false, includeMajorLiterals: false }).metas.map(meta => meta.id)
      if (!cardIds.length) continue
      let broadFootprint = file.startsWith('shared/cards/major/')
      const footprint = (node: ts.Node): void => {
        if ((ts.isIdentifier(node) && /^(?:handHooks|globalQuery)$/.test(node.text))
          || (ts.isPropertyAssignment(node) && node.name.getText(source) === 'zones' && /['"]hand['"]/.test(node.initializer.getText(source)))) broadFootprint = true
        ts.forEachChild(node, footprint)
      }
      footprint(source)
      index.sources.push({ file, cardIds, broadFootprint })
      for (const id of cardIds) {
        const key = cardKey(id)
        if (canonical.has(key)) throw new Error(`Ambiguous Card Source identity: ${id}`)
        canonical.set(key, id)
      }
    }
    if (!index.sources.length) throw new Error('Card Source identity discovery is empty')
  } catch (error) {
    index.expansionReasons.push(`Card Source identities cannot be established: ${failure(error)}; full verification is required.`)
    return index
  }
  const sources = new Map(index.sources.map(source => [source.file, source.cardIds]))
  type Module = { cardIds: Set<string>; safetyReasons: Set<string>; dependencies: Set<string>; riskReasons: Set<string>; cardConsumer: boolean }
  const modules = new Map<string, Module>()
  const inspect = (file: string): Module => {
    const cached = modules.get(file)
    if (cached) return cached
    const result: Module = { cardIds: new Set(), safetyReasons: new Set(), dependencies: new Set(), riskReasons: new Set(), cardConsumer: false }
    modules.set(file, result)
    if (bootstrap.has(file)) return result
    const addReferences = (value: string) => {
      if (/\b(?:cardId|cardIds|sourceCard|cardStates|minorPlayed|occupationPlayed|minorHand|occupationHand)\b|cards-manifest|data-card/.test(value)) result.cardConsumer = true
      for (const match of value.matchAll(/\b(?:[A-Z]+\d+_[A-Za-z]\w*|Major_\w+|CUSTOM_\w*)\b/g)) {
        const id = canonical.get(cardKey(match[0]))
        if (id) result.cardIds.add(id)
      }
    }
    const dependency = (specifier: string, typeOnly = false, bootstrapOnly = false) => {
      if (typeOnly) return
      if (/^(?:glob|fast-glob)$/.test(specifier)) result.riskReasons.add(`Filesystem or glob consumer: ${file}`)
      if (!specifier.startsWith('.')) return
      const resolved = ts.resolveModuleName(specifier, join(cwd, file), {
        moduleResolution: ts.ModuleResolutionKind.Bundler, allowJs: true, resolveJsonModule: true,
      }, ts.sys).resolvedModule?.resolvedFileName
      if (!resolved) {
        result.riskReasons.add(`Unresolved local dependency in ${file}: ${specifier}`)
        return
      }
      const target = normalize(relative(cwd, resolved))
      if (target.startsWith('../')) throw new Error(`Test dependency escapes repository: ${file}: ${specifier}`)
      const ids = sources.get(target)
      if (ids) {
        ids.forEach(id => result.cardIds.add(id))
        return
      }
      if (bootstrap.has(target)) return
      if (bootstrapOnly && target === 'shared/cards/register-all.ts') return
      if (testLocal(target)) result.dependencies.add(target)
      else if (/^shared\/cards\/(?:catalog|register-all|registry|registry-runtime|custom-registry|major(?:\/index)?)(?:\.|$)/.test(target)) {
        result.safetyReasons.add(`Generic card registry consumer: ${file}`)
      } else if (!/^(?:shared|server|client|replay-viewer)\//.test(target)) result.riskReasons.add(`Unclassified dependency in ${file}: ${target}`)
    }
    try {
      const absolute = resolve(cwd, file)
      if (!lstatSync(absolute).isFile()) throw new Error(`Test dependency must be a regular file: ${file}`)
      const source = parseSource(absolute)
      const visit = (node: ts.Node): void => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isIdentifier(node)) addReferences(node.text)
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          const bindings = node.importClause?.namedBindings
          const typeOnly = node.importClause?.isTypeOnly || (bindings && ts.isNamedImports(bindings)
            && !node.importClause?.name && bindings.elements.length > 0 && bindings.elements.every(binding => binding.isTypeOnly))
          dependency(node.moduleSpecifier.text, Boolean(typeOnly), !node.importClause)
        }
        if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) dependency(node.moduleSpecifier.text, node.isTypeOnly)
        if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
          const specifier = node.arguments[0]
          if (specifier && ts.isStringLiteral(specifier)) dependency(specifier.text)
          else result.riskReasons.add(`Computed module consumer: ${file}`)
        }
        if (ts.isIdentifier(node) && /^(?:ALL_CARD_IMPLS|catalogCardDefinitions|allMinorImprovementCards|allOccupationCards|majorCardDefinitions|(?:get|lookup|find)Card(?:Definition|Effect|Impl|Modifiers|Listeners)(?:ById)?)$/.test(node.text)) {
          result.safetyReasons.add(`Generic card registry consumer: ${file}`)
        }
        if ((ts.isTemplateExpression(node) && /(?:\b[A-E]\d*|\bM\d*|Major_|CUSTOM_)$/.test(node.head.text))
          || (ts.isPropertyAccessExpression(node) && node.name.text === 'glob')) result.riskReasons.add(`Computed source consumer: ${file}`)
        if (ts.isIdentifier(node) && /^(?:readFile(?:Sync)?|readdir(?:Sync)?|glob(?:Sync)?|createReadStream)$/.test(node.text)) result.riskReasons.add(`Filesystem or glob consumer: ${file}`)
        if ((ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^(?:createOpeningSession|finishHotseatOpening)$/.test(node.expression.text))
          || (ts.isImportSpecifier(node) && /^(?:createOpeningSession|finishHotseatOpening)$/.test((node.propertyName ?? node.name).text))) result.safetyReasons.add(`Unbounded opening-card fixture: ${file}`)
        if ((ts.isPropertyAccessExpression(node) && ts.isPropertyAccessExpression(node.expression)
          && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'process' && node.expression.name.text === 'env'
          && /CARD|FIXTURE|MODULE/.test(node.name.text))
          || (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
            && node.expression.expression.text === 'Math' && node.expression.name.text === 'random')) result.riskReasons.add(`Unbounded external card input: ${file}`)
        if (ts.isElementAccessExpression(node) && ts.isPropertyAccessExpression(node.expression)
          && /^(?:minorHand|occupationHand)$/.test(node.expression.name.text)) result.safetyReasons.add(`Unbounded hand-card consumer: ${file}`)
        ts.forEachChild(node, visit)
      }
      visit(source)
    } catch (error) {
      throw new Error(`Cannot inspect card test evidence ${file}: ${failure(error)}`, { cause: error })
    }
    return result
  }
  try {
    for (const file of [...inventory.vitest.map(test => test.file), ...inventory.browser]) {
      const cardIds = new Set<string>()
      const safetyReasons = new Set<string>()
      const riskReasons = new Set<string>()
      let cardConsumer = /^(?:shared\/cards\/)|^e2e-tests\/[^/]*(?:card|choice|farm|scor|sandbox|rule|listener|moor|heating|baking|payment|animal)/i.test(file)
      const visited = new Set<string>()
      const traverse = (target: string) => {
        if (visited.has(target)) return
        visited.add(target)
        const module = inspect(target)
        module.cardIds.forEach(id => cardIds.add(id))
        module.safetyReasons.forEach(reason => safetyReasons.add(reason))
        module.riskReasons.forEach(reason => riskReasons.add(reason))
        cardConsumer ||= module.cardConsumer
        module.dependencies.forEach(traverse)
      }
      traverse(file)
      if (cardUiSafety.has(file)) safetyReasons.add(`Generic card rendering and choice consumer: ${file}`)
      riskReasons.forEach(reason => {
        if (!reason.startsWith('Unbounded external card input:') || cardConsumer || cardIds.size || safetyReasons.size) safetyReasons.add(reason)
      })
      if (!cardIds.size && cardConsumer) safetyReasons.add(`Unbounded card-test ownership: ${file}`)
      index.tests.push({ file, cardIds: [...cardIds].sort(), safetyReasons: [...safetyReasons].sort() })
    }
  } catch (error) {
    index.expansionReasons.push(`${failure(error)}; full verification is required.`)
  }
  return index
}

export function cardVerification(paths: string[], inventory: TestInventory, associations: CardAssociationIndex | undefined, changes: ChangedPath[]): { checks: PlannedCheck[]; expansionReasons: string[] } {
  const expand = (reason: string) => ({ checks: [], expansionReasons: [`${reason}; full verification is required.`] })
  if (!associations) return expand('Card test association evidence is missing')
  if (associations.expansionReasons.length) return { checks: [], expansionReasons: associations.expansionReasons }
  if (associations.inventoryKey !== inventoryKey(inventory)) return expand('Card test association evidence does not match the discovered test inventory')
  const missingUi = [...cardUiSafety].filter(file => !inventory.browser.includes(file))
  if (missingUi.length) throw new Error(`Declared card UI consumers are missing: ${missingUi.join(', ')}`)
  const changed = new Set(paths)
  const productionCard = (file: string) => /^shared\/cards\/(?:[A-Z]+|major|community)\/[^/]+\.ts$/.test(file)
  if (changes.some(change => change.status !== 'M'
    && (productionCard(change.path) && changed.has(change.path)
      || change.status === 'R' && productionCard(change.previousPath) && changed.has(change.previousPath)))) {
    return expand('Added, deleted or renamed production Card Sources need broader verification before associations can be trusted')
  }
  const cardIds = new Set<string>()
  for (const file of paths) {
    const ids = associations.sources.find(source => source.file === file)?.cardIds
      ?? associations.tests.find(test => test.file === file)?.cardIds
    if (!ids?.length) return expand(`Card ownership or behavior associations are missing for ${file}`)
    ids.forEach(id => cardIds.add(id))
  }
  for (const id of cardIds) {
    if (associations.sources.some(source => source.cardIds.includes(id) && source.broadFootprint)) return expand(`Card ${id} has hand or global availability that cannot be bounded by played-card associations`)
    if (!associations.tests.some(test => test.cardIds.includes(id) && /^(?:shared\/cards\/|server\/)/.test(test.file))) {
      return expand(`No declared behavior-test association exists for ${id}`)
    }
  }
  const selected = new Set(associations.tests.filter(test => test.safetyReasons.length || test.cardIds.some(id => cardIds.has(id))).map(test => test.file))
  const projects = [...new Set(inventory.vitest.filter(test => selected.has(test.file)).map(test => test.project))].sort()
  const browsers = inventory.browser.filter(file => selected.has(file)).sort()
  return { expansionReasons: [], checks: [
    { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'build' },
    ...projects.map(project => ({ kind: 'vitest' as const, project, files: inventory.vitest.filter(test => test.project === project && selected.has(test.file)).map(test => test.file).sort() })),
    ...(inventory.browser.length ? [
      { kind: 'catalog', taskId: 'browser-sandbox' }, { kind: 'catalog', taskId: 'webkit' },
      ...(browsers.length ? [{ kind: 'browser', browser: 'chromium', files: browsers, grep: null } satisfies PlannedCheck] : []),
    ] satisfies PlannedCheck[] : []),
  ] }
}
