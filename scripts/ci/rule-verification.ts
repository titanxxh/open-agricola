import { join, posix, relative } from 'node:path'
import ts from 'typescript'
import { parseSource } from '../source-files'
import type { CardAssociationIndex } from './card-verification'
import type { TestConsumerIndex } from './test-consumers'
import type { PlannedCheck, TestInventory } from './verification-plan'

export const RULE_SUBSYSTEM_IDS = ['payment', 'animals', 'scoring', 'farm-crops', 'round-variants', 'core'] as const
export type RuleSubsystemId = typeof RULE_SUBSYSTEM_IDS[number]
type NarrowSubsystem = Exclude<RuleSubsystemId, 'core'>
type RuleAssociation = { file: string; subsystems: RuleSubsystemId[]; safetyReasons: string[] }
export type RuleAssociationIndex = {
  inventoryKey: string
  cards: Array<{ file: string; cardIds: string[]; subsystems: RuleSubsystemId[] }>
  tests: RuleAssociation[]
  expansionReasons: string[]
}

const ordered = (groups: Iterable<RuleSubsystemId>): RuleSubsystemId[] => {
  const selected = new Set(groups)
  return RULE_SUBSYSTEM_IDS.filter(id => selected.has(id))
}
const inventoryKey = (inventory: TestInventory) => JSON.stringify(inventory)
const ruleProjects = new Set(['fast-shared', 'fast-cards', 'fast-card-runtime', 'fast-client', 'fast-server', 'fast-tests', 'slow'])
const sourcePath = (path: string) => path.replaceAll('\\', '/').replaceAll('/__tests__/', '/').replace(/\.(?:test|spec)(?=\.)/, '')
const belongs = (path: string, prefix: string, names: string) => new RegExp(`^${prefix}/(?:${names})(?:[.-]|/|$)`).test(path)

export function ruleSubsystemsForPath(path: string): RuleSubsystemId[] {
  const file = sourcePath(path)
  const groups = new Set<RuleSubsystemId>()
  const add = (...ids: RuleSubsystemId[]) => ids.forEach(id => groups.add(id))
  if (/^shared\/actions\/payment(?:\/|$)/.test(file)) add('payment')
  if (belongs(file, 'shared/domain', 'animal-payment')) add('payment', 'animals', 'round-variants')
  else if (belongs(file, 'shared/domain', 'harvest-breed-placement')) add('animals', 'round-variants')
  else if (belongs(file, 'shared/domain', 'heating-payment')) add('payment', 'round-variants')
  else if (belongs(file, 'shared/domain', 'room-construction|player-board')) add('animals', 'farm-crops')
  else if (belongs(file, 'shared/domain', 'pasture|stable-pieces|stables|fence-segments')) add('animals', 'scoring', 'farm-crops')
  else if (belongs(file, 'shared/domain', 'supply-tokens')) add('payment', 'farm-crops')
  else if (belongs(file, 'shared/domain', 'farmyard-usage(?:-core)?')) add('scoring', 'farm-crops')
  else if (belongs(file, 'shared/domain', 'field')) add('scoring', 'farm-crops', 'round-variants')
  else if (belongs(file, 'shared/domain', 'animal(?:s|-[^/]*)')) add('animals')
  else if (belongs(file, 'shared/domain', 'scoring(?:-[^/]*)?|score-rules')) add('scoring')
  else if (belongs(file, 'shared/domain', 'farm(?:yard)?(?:-[^/]*)?|farm-position-selection')) add('farm-crops')
  else if (belongs(file, 'shared/domain', 'player|supply-workers|card-worker-space')) add('round-variants')
  if (belongs(file, 'shared/domain', 'space')) add('round-variants')
  if (belongs(file, 'shared/actions/effects', 'pay|individual-food-cost|improvement|occupation')) add('payment')
  else if (belongs(file, 'shared/actions/effects', 'exchange|bake-bread')) add('payment', 'animals', 'round-variants')
  else if (belongs(file, 'shared/actions/effects', 'construct|renovation|fencing|stables|plow')) add('payment', 'animals', 'farm-crops')
  else if (belongs(file, 'shared/actions/effects', 'sow|reap')) add('farm-crops', 'round-variants')
  else if (belongs(file, 'shared/actions/effects', 'reorganize|breed')) add('animals', 'round-variants')
  else if (belongs(file, 'shared/actions/effects', 'bonus-vp')) add('scoring')
  else if (belongs(file, 'shared/actions/effects', 'family-growth|first-player|place-farmer')) add('round-variants')
  else if (belongs(file, 'shared/actions/effects/internal', 'field-operation|claim-field-goods-tokens|claim-farmyard-goods-tokens')) add('farm-crops')
  else if (belongs(file, 'shared/actions/effects/internal', 'add-animal-capacity|lie-animal')) add('animals')
  else if (belongs(file, 'shared/actions/effects/internal', 'future-meeples|moor-solo-[^/]*|reserve-fence-supply|recall-placed-worker|spend-worker|scheduled-offers')) add('round-variants')
  if (belongs(file, 'shared/actions/helpers', 'cost-preview|pay-child|trades|trade-applied-listener|individual-food-cost|improvement-helpers')) add('payment')
  else if (belongs(file, 'shared/actions/helpers', 'exchange-recipes|feed-family|harvest-feeding-requirement')) add('payment', 'animals', 'round-variants')
  else if (belongs(file, 'shared/actions/helpers', 'harvest-count-registry|harvest-outcome|reap-listener')) add('farm-crops', 'round-variants')
  else if (belongs(file, 'shared/actions/helpers', 'extra-crop-placement-context|fence-contributions|missing-building-resource-spaces')) add('farm-crops')
  else if (belongs(file, 'shared/actions/helpers', 'placement-availability|placement-constants')) add('round-variants')
  if (belongs(file, 'shared/actions/plans', 'payment-choice|crop-payment')) add('payment', 'farm-crops')
  else if (belongs(file, 'shared/actions/plans', 'field-operation')) add('farm-crops')
  else if (belongs(file, 'shared/actions/plans', 'scoring-offer')) add('scoring')
  if (belongs(file, 'shared/cards/helpers', 'pay-gain-node')) add('core')
  else if (belongs(file, 'shared/cards/helpers', 'construct-cost|renovation-cost|payment-stats|reserved-resources')) add('payment')
  else if (belongs(file, 'shared/cards/helpers', 'card-field')) add('scoring', 'farm-crops', 'round-variants')
  else if (belongs(file, 'shared/cards/helpers', 'construction-events|fence-events|farmyard-events|stable-removal')) add('farm-crops')
  else if (belongs(file, 'shared/cards/helpers', 'public-card-markers|pareto-bonus|stone-house-bonus')) add('scoring')
  else if (belongs(file, 'shared/cards/helpers', 'harvest-skip|supply-worker-flow|round-placement|recall-worker|card-held-workers')) add('round-variants')
  else if (belongs(file, 'shared/cards/helpers', 'action-snapshot|turn-token|stage-effects|round-action-topology|end-turn-reactions')) add('round-variants')
  else if (belongs(file, 'shared/cards/helpers', 'cookery|exchange-registry|stored-food-cashout')) add('payment', 'animals', 'round-variants')
  else if (belongs(file, 'shared/cards/helpers', 'prerequisites|pass-occupation')) add('payment')
  else if (belongs(file, 'shared/cards/helpers', 'moor-balance')) add('round-variants')
  if (belongs(file, 'shared/cards/major', 'supply')) add('payment', 'round-variants')
  if (/^shared\/cards\/M\/moor-/.test(file) || belongs(file, 'shared/cards', 'player-action-space|timed-rule-obligations')) add('round-variants')
  if (/^shared\/(?:moor|parents|seasons|draft)\//.test(file)) add('round-variants')
  if (belongs(file, 'shared/moor', 'farm-terrain|terrain-[^/]*')) add('farm-crops')
  if (belongs(file, 'shared/moor', 'heating')) add('payment')
  if (/^shared\/session\/(?:harvest-summary|phases\/(?:harvest|draft|setup))(?:[.-]|$)/.test(file)) add('round-variants')
  if (/^shared\/contract\/(?:animals|animal-zone-occupancy)(?:[.-]|$)/.test(file)) add('animals')
  if (groups.size) return ordered(groups)
  return /^shared\/(?:actions|cards|domain|engine|session|events|utils|i18n|contract|projections|custom-code|moor|parents|seasons|draft)\//.test(file)
    || file === 'server/game/authoritative-session.ts' ? ['core'] : []
}

const mechanismGroups: Array<{ groups: NarrowSubsystem[]; tokens: RegExp }> = [
  { groups: ['payment', 'animals', 'farm-crops'], tokens: /^farm-expansion$/ },
  { groups: ['payment'], tokens: /^(?:PaymentSolver|CardPurchasePayment|ComplexCost|PaymentSolution|PaymentReceipt|BonusModifier|TradeModifier|onBuy|defineOccupationCard|deriveCardCostCandidate|computeCosts|costAttribution|paymentResourceProviders|costResourceRemovals|computeResourceCommitments|computeAllBuyableCombinations|applyCostModifiers|pay|occupation|improvement|renovate-house|bake-bread|trade|bonus)$/ },
  { groups: ['animals'], tokens: /^(?:AnimalZone|AnimalKey|computeAnimalZones|onComputeAnimalZones|onComputeSharedAnimalZones|computePastureCapacityModifiers|computeBreedableAnimalCount|computeBreedThreshold|onAnimalRemoved|consumeAnimalPayment|applyAnimalPayment|buildAnimalReorgRequest|prefillAnimalZones|canAccommodateAnimalTotals|canAccommodateAllAnimals|getInvalidAnimals|enforceReorganizeOnLastHarvest|animal-reorg|reorganize|breed|animal\.received|animal\.bred)$/ },
  { groups: ['scoring'], tokens: /^(?:Scoring|PlayerScoreSummary|ScoreCategoryResult|onScore|computeScores|computeBonusScore|computeCostedBonus|computeSharedPostScore|computeSourceCardContribution|computeAnimalScoreAdjustment|solveBonusScoring|ScoringReserve|readScoringReserve|farmerScoreAdjustment|unusedSpaceReduction|bonus-vp|record-scoring-reserve-bonus)$/ },
  { groups: ['farm-crops'], tokens: /^(?:Farmyard|FarmInteraction|FarmTilePosition|commitFarmOperation|commitRoomConstruction|getFarmyardFields|getLogicalFields|mutateLogicalFields|canPlow|canSow|canBuildFence|canBuildRoom|canBuildStable|computeExtraRoomCapacity|onComputeSowableFields|onSowExtraField|computeLockedFarmTiles|getSpecialStablePositions|applySpecialStable|getBuiltSpecialStables|returnSpecialStable|onCropRemoved|onReap|fence|fencing|construct|stables|plow|sow|reap|field-operation|farm\.spacesUsed|farm\.fieldPlowed|farm\.fenced)$/ },
  { groups: ['round-variants'], tokens: /^(?:onRoundStart|onBeforeRevealAction|onAfterRevealAction|onBeforeWork|onWorkStart|onPreparation|onEndPreparation|onBeforeHarvest|onStartHarvest|onStartHarvestFieldPhase|onHarvestFieldPhase|onEndHarvestFieldPhase|onAfterReap|onBeforeBreed|onAfterBreed|onBeforeFeed|onAfterFeed|onHarvest|onEndHarvest|onStartHarvestFeedingPhase|onHarvestFeedingPhase|onEndHarvestFeedingPhase|onAfterHarvest|onBeforeReturnHome|onStartReturnHome|onReturnHome|onRoundEnd|onAfterRoundEnd|onBeforeEndGame|onBeforeStartOfTurn|onAllWorkersPlaced|computeHarvestBreedOrderPriority|contributeExtraTurn|countExtraTurns|onBeforePlayerTurn|onEndTurn|computeFeedingRequirement|computeHeatingRequirement|computeHeatingRequirementBeforeSeason|family-growth|set-first-player|harvest|feed|heating)$/ },
]
const groupsForTokens = (tokens: Iterable<string>): RuleSubsystemId[] => ordered(
  mechanismGroups.flatMap(mechanism => [...tokens].some(token => mechanism.tokens.test(token)) ? mechanism.groups : []),
)
const seamDependencies = new Set(['server/game/authoritative-session.ts', 'shared/session/session-core.ts', 'shared/domain/index.ts', 'shared/cards/registry.ts', 'shared/cards/active-registry.ts', 'shared/cards/catalog.ts', 'shared/cards/card-effects.ts', 'shared/cards/card-listeners.ts', 'shared/actions/hooks.ts', 'shared/engine/registry.ts'])
const fixtureDependencies = new Set(['shared/contract/types.ts', 'shared/cards/session-card-context.ts', 'shared/session/state-bootstrap.ts', 'shared/session/serialization.ts', 'shared/session/history-streams.ts', 'shared/session/stats.ts', 'shared/cards/registry-display.ts'])
const declarationDependencies = new Set(['shared/cards/card-source', 'shared/cards/helpers/card-state', 'shared/cards/registry-display', 'shared/cards/major/metadata', 'shared/contract/types', 'shared/contract/events', 'shared/actions/hooks', 'shared/cards/card-listeners', 'shared/events/append', 'shared/events/query', 'shared/actions/flow', 'shared/actions/helpers/ad-hoc-action-registry', 'shared/actions/helpers/selection-effect-registry', 'shared/engine/action-context-flags'])
const commonMechanisms = new Set(['shared/actions/effects/gain', 'shared/actions/effects/lose', 'shared/session/stats', 'shared/utils/rng'])
const neutralCardHelpers = new Set(['card-gain', 'card-random', 'card-storage', 'card-type', 'action-space-categories', 'lessons-spaces', 'event-provenance', 'trigger-snapshot', 'state-presentation'].map(name => `shared/cards/helpers/${name}.ts`))
const paymentHelperExports = new Map<string, RuleSubsystemId[]>([
  ['gainLeaf', []], ['bonusVpLeaf', ['scoring']], ['payLeaf', ['payment']],
  ...['payGainActionFlow', 'payGainFlow', 'payGainNode', 'payThenGainActionFlow', 'payThenActionFlow', 'returnToSpaceThenGainFlow'].map(name => [name, ['payment', 'scoring']] as [string, RuleSubsystemId[]]),
])
const ruleNamespace = (file: string) => /^shared\/(?:actions|cards|domain|engine|session|draft|moor|parents|seasons)\//.test(file)
const ruleCalls = /^(?:takeAction|resolveChoice|performRoundEnd|performHarvest|performFieldPhase|performBreedPhase|performFeedPhase|getActionAvailability|getAnytimeActions|executeAnytimeAction|runCardEffectHook|computeScores|commitSelection|takeActionAsPlayer|setupScenario)$/
const isCardSource = (file: string) => /^shared\/cards\/(?:[A-Z]+|major|community)\/[^/]+\.ts$/.test(file)
const failure = (error: unknown) => error instanceof Error ? error.message : String(error)

export function readRuleAssociationIndex(cwd: string, inventory: TestInventory, cardAssociations: CardAssociationIndex, testConsumers: TestConsumerIndex): RuleAssociationIndex {
  const result: RuleAssociationIndex = { inventoryKey: inventoryKey(inventory), cards: [], tests: [], expansionReasons: [] }
  if (cardAssociations.inventoryKey !== result.inventoryKey || testConsumers.inventoryKey !== result.inventoryKey) {
    result.expansionReasons.push('Rule associations do not match the independently discovered test inventory.')
    return result
  }
  result.expansionReasons.push(...cardAssociations.expansionReasons, ...testConsumers.expansionReasons)
  try {
    const mechanismCache = new Map<string, RuleSubsystemId[]>()
    const cardMechanisms = (file: string, visiting = new Set<string>()): RuleSubsystemId[] => {
      const cached = mechanismCache.get(file)
      if (cached) return cached
      if (visiting.has(file)) return ['core']
      visiting.add(file)
      const tokens = new Set<string>()
      const hookNames = new Set<string>()
      const groups = new Set<RuleSubsystemId>(file.startsWith('shared/cards/helpers/') ? ruleSubsystemsForPath(file).filter(id => id !== 'core') : [])
      const parsed = parseSource(join(cwd, file))
      const dependency = (specifier: string, importedNames?: string[]) => {
        if (!specifier.startsWith('.')) return
        const target = posix.normalize(posix.join(posix.dirname(file), specifier)).replace(/\.[cm]?[jt]sx?$/, '')
        if (target.startsWith('shared/contract/') || declarationDependencies.has(target) || commonMechanisms.has(target)) return
        if (target === 'shared/cards/helpers/pay-gain-node') {
          if (!importedNames?.length || importedNames.some(name => !paymentHelperExports.has(name))) groups.add('core')
          else importedNames.flatMap(name => paymentHelperExports.get(name) ?? []).forEach(id => groups.add(id))
          return
        }
        const helper = target.startsWith('shared/cards/helpers/')
        ruleSubsystemsForPath(target).filter(id => !helper || id !== 'core').forEach(id => groups.add(id))
        if (!helper) return
        const resolved = ts.resolveModuleName(specifier, join(cwd, file), { moduleResolution: ts.ModuleResolutionKind.Bundler }, ts.sys).resolvedModule
        if (!resolved) throw new Error(`Cannot resolve card mechanism helper in ${file}: ${specifier}`)
        const helperFile = relative(cwd, resolved.resolvedFileName).replaceAll('\\', '/')
        const nested = cardMechanisms(helperFile, new Set(visiting))
        if (!nested.length && !neutralCardHelpers.has(helperFile)) groups.add('core')
        nested.forEach(id => groups.add(id))
      }
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) tokens.add(node.text)
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) hookNames.add(node.text)
        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /^(?:sheep|boar|cattle|horse)$/.test(node.text)) groups.add('animals')
        if ((ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node) || ts.isShorthandPropertyAssignment(node)) && node.name) {
          if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) hookNames.add(node.name.text)
        }
        if (ts.isPropertyAssignment(node) && node.name.getText(parsed) === 'cost' && ts.isObjectLiteralExpression(node.initializer) && node.initializer.properties.length) groups.add('payment')
        if (ts.isPropertyAssignment(node) && /^(?:sheep|boar|cattle|horse)$/.test(node.name.getText(parsed).replace(/^['"]|['"]$/g, ''))
          && !(ts.isNumericLiteral(node.initializer) && Number(node.initializer.text) === 0)) groups.add('animals')
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          const bindings = node.importClause?.namedBindings
          const typeOnly = node.importClause?.isTypeOnly || (bindings && ts.isNamedImports(bindings)
            && !node.importClause?.name && bindings.elements.length > 0 && bindings.elements.every(binding => binding.isTypeOnly))
          if (!typeOnly) dependency(node.moduleSpecifier.text, !node.importClause?.name && bindings && ts.isNamedImports(bindings)
            ? bindings.elements.filter(binding => !binding.isTypeOnly).map(binding => (binding.propertyName ?? binding.name).text) : undefined)
        }
        if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly) {
          dependency(node.moduleSpecifier.text, node.exportClause && ts.isNamedExports(node.exportClause)
            ? node.exportClause.elements.filter(binding => !binding.isTypeOnly).map(binding => (binding.propertyName ?? binding.name).text) : undefined)
        }
        if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
          const specifier = node.arguments[0]
          if (specifier && ts.isStringLiteral(specifier)) dependency(specifier.text)
          else groups.add('core')
        }
        ts.forEachChild(node, visit)
      }
      visit(parsed)
      groupsForTokens(tokens).forEach(id => groups.add(id))
      if ([...hookNames].some(token => /^(?:on[A-Z]|compute[A-Z])/.test(token)
        && !mechanismGroups.some(mechanism => mechanism.tokens.test(token))
        && !/^(?:onBuy|onRemove|onScore|computeCosts)$/.test(token))) groups.add('core')
      const selected = ordered(groups)
      mechanismCache.set(file, selected)
      return selected
    }
    for (const source of cardAssociations.sources) {
      const groups = new Set<RuleSubsystemId>(cardMechanisms(source.file))
      result.cards.push({ ...source, subsystems: ordered(groups) })
    }
    const cardsById = new Map(result.cards.flatMap(card => card.cardIds.map(id => [id, card] as const)))
    const cardsByFile = new Map(result.cards.map(card => [card.file, card]))
    const cardTests = new Map(cardAssociations.tests.map(test => [test.file, test]))
    const projects = new Map(inventory.vitest.map(test => [test.file, test.project]))
    const consumers = new Map(testConsumers.tests.map(test => [test.file, test]))
    const localSymbols = new Map<string, string[]>()
    const symbolsIn = (file: string) => {
      const cached = localSymbols.get(file)
      if (cached) return cached
      const tokens = new Set<string>()
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) tokens.add(node.text)
        ts.forEachChild(node, visit)
      }
      visit(parseSource(join(cwd, file)))
      const symbols = [...tokens]
      localSymbols.set(file, symbols)
      return symbols
    }
    const uncertaintyTouchesRules = (reason: string) => {
      const origin = reason.match(/(?: in |: )([^ :]+\.[cm]?[jt]sx?)(?::|$)/)?.[1]
      if (!origin) return true
      return ruleNamespace(origin) || symbolsIn(origin).some(symbol => ruleCalls.test(symbol)
        || /^(?:GameSession|ALL_CARD_IMPLS|getCardEffect|createOpeningSession|finishHotseatOpening)$/.test(symbol)
        || /^shared\/(?:cards|actions|domain|engine)(?:\/|$)/.test(symbol))
    }
    const files = [...inventory.vitest.map(test => test.file), ...inventory.browser]
    if (consumers.size !== testConsumers.tests.length || files.length !== consumers.size || files.some(file => !consumers.has(file))) {
      throw new Error('Rule test consumer evidence is missing, duplicated or stale')
    }
    for (const file of files) {
      const consumer = consumers.get(file)
      if (!consumer) throw new Error(`Missing rule consumer evidence: ${file}`)
      const associated = cardTests.get(file)
      if (projects.has(file) && !ruleProjects.has(projects.get(file)!)) {
        result.tests.push({ file, subsystems: [], safetyReasons: [] })
        continue
      }
      const actualRuleCalls = consumer.symbols.some(symbol => ruleCalls.test(symbol))
      const cardSourceImport = consumer.dependencies.some(dependency => cardsByFile.has(dependency))
      const declaredBrowser = Object.values(browserConsumers).flat().some(name => file === `e2e-tests/${name}.spec.ts`)
      const ruleDependency = consumer.dependencies.some(dependency => ruleNamespace(dependency)
        && !fixtureDependencies.has(dependency) && !seamDependencies.has(dependency)
        && !declarationDependencies.has(dependency.replace(/\.[cm]?[jt]sx?$/, ''))
        && !/(?:^|\/)(?:__tests__|_helpers|fixtures|__fixtures__)\//.test(dependency))
      const behaviorEvidence = ruleNamespace(file) || projects.get(file) === 'slow' || cardSourceImport || declaredBrowser || ruleDependency
        || actualRuleCalls && consumer.dependencies.some(dependency => seamDependencies.has(dependency))
      if (!behaviorEvidence) {
        result.tests.push({ file, subsystems: [], safetyReasons: [] })
        continue
      }
      const groups = new Set<RuleSubsystemId>(groupsForTokens([...consumer.symbols, ...consumer.literals]))
      const safetyReasons: string[] = []
      for (const dependency of consumer.dependencies) {
        const card = cardsByFile.get(dependency)
        if (card) {
          card.subsystems.forEach(id => groups.add(id))
          if (card.subsystems.includes('core')) safetyReasons.push(`Unbounded Card Source mechanism: ${card.file}`)
        }
        else if (!seamDependencies.has(dependency) && !fixtureDependencies.has(dependency) && !isCardSource(dependency)
          && !declarationDependencies.has(dependency.replace(/\.[cm]?[jt]sx?$/, '')) && !commonMechanisms.has(dependency.replace(/\.[cm]?[jt]sx?$/, ''))
          && (ruleNamespace(dependency) || ruleSubsystemsForPath(dependency).some(id => id !== 'core'))
          && !/(?:^|\/)(?:__tests__|_helpers|fixtures|__fixtures__)\//.test(dependency)
          && !/^(?:shared\/cards\/(?:__tests__|registry|register-all|card-source)|server\/__tests__\/)/.test(dependency)) {
          const helper = dependency.startsWith('shared/cards/helpers/')
          const declared = helper ? cardMechanisms(dependency) : ruleSubsystemsForPath(dependency)
          if (helper && !declared.length && !neutralCardHelpers.has(dependency)) declared.push('core')
          declared.forEach(id => groups.add(id))
          if (declared.includes('core')) safetyReasons.push(`Unbounded shared rule dependency: ${dependency}`)
        }
      }
      for (const cardId of associated?.cardIds ?? []) {
        const card = cardsById.get(cardId)
        if (!card) throw new Error(`Stale Card Source association for ${file}: ${cardId}`)
        card.subsystems.forEach(id => groups.add(id))
        if (card.subsystems.includes('core')) safetyReasons.push(`Unbounded Card Source mechanism: ${card.file}`)
      }
      if (ruleNamespace(file) && !file.startsWith('shared/cards/')) ruleSubsystemsForPath(file).forEach(id => groups.add(id))
      const ruleConsumer = groups.size || associated?.cardIds.length || file.startsWith('shared/cards/')
        || consumer.dependencies.some(dependency => seamDependencies.has(dependency)) && consumer.symbols.some(symbol => ruleCalls.test(symbol))
      if (ruleConsumer) {
        const directCardEvidence = file.startsWith('shared/cards/') || projects.get(file) === 'slow' || cardSourceImport
          || symbolsIn(file).some(symbol => /^(?:cardStates|minorPlayed|occupationPlayed|ALL_CARD_IMPLS|catalogCardDefinitions|getCardEffect|createOpeningSession|finishHotseatOpening)$/.test(symbol))
        safetyReasons.push(...consumer.uncertaintyReasons.filter(uncertaintyTouchesRules),
          ...(associated?.safetyReasons ?? []).filter(reason => directCardEvidence && uncertaintyTouchesRules(reason)))
      }
      if (groups.has('core')) safetyReasons.push('Shared rule or card mechanism cannot be narrowed safely')
      if (!groups.size && ruleConsumer && (!associated?.cardIds.length || safetyReasons.length)) {
        groups.add('core')
        safetyReasons.push('Rule consumer has no narrower declared mechanism')
      }
      result.tests.push({ file, subsystems: ordered(groups), safetyReasons: [...new Set(safetyReasons)].sort() })
    }
  } catch (error) {
    result.expansionReasons.push(`Cannot establish complete rule associations: ${failure(error)}`)
  }
  return result
}

const browserConsumers: Record<NarrowSubsystem, string[]> = {
  payment: ['choice-previews', 'rule-derived-action-preview', 'seasonal-fence-log', 'heating-exchange', 'listener-lifecycle-room'],
  animals: ['room-animal-holders', 'animal-reorg-prefill', 'stage-animal-settlement', 'parrot-breeder'],
  scoring: ['crop-scoring', 'grain-distillery-scoring', 'source-aware-scoring', 'mobile-scoring-pad'],
  'farm-crops': ['farm-select', 'farm-card-targets', 'apiary-sow-budget', 'farm-interaction-focus', 'choice-previews'],
  'round-variants': ['heating-exchange', 'bga-preparation-order', 'seasonal-settlement-logs', 'moor-completion-window', 'standard-solo-acceptance'],
}

export function ruleVerification(paths: string[], inventory: TestInventory, associations: RuleAssociationIndex | undefined): { checks: PlannedCheck[]; expansionReasons: string[]; wideningReasons: string[] } {
  const expand = (reason: string) => ({ checks: [], expansionReasons: [reason], wideningReasons: [] })
  if (!associations) return expand('Rule association evidence is missing; full verification is required.')
  if (associations.inventoryKey !== inventoryKey(inventory)) return expand('Rule association evidence is stale; full verification is required.')
  if (associations.expansionReasons.length) return { checks: [], expansionReasons: associations.expansionReasons, wideningReasons: [] }
  const groups = new Set<RuleSubsystemId>()
  for (const path of paths) {
    const selected = ruleSubsystemsForPath(path)
    if (!selected.length) return expand(`Rule ownership is unknown for ${path}; full verification is required.`)
    selected.forEach(id => groups.add(id))
  }
  if (!groups.size) return expand('No rule subsystem was established; full verification is required.')
  if (groups.has('core')) {
    const projects = [...ruleProjects]
    const missing = projects.filter(project => !inventory.vitest.some(test => test.project === project))
    if (missing.length || !inventory.browser.length) throw new Error(`Declared complete rule consumers are missing: ${missing.join(', ') || 'browser inventory'}`)
    return {
      checks: [
        ...projects.map((project): PlannedCheck => ({ kind: 'vitest', project, files: inventory.vitest.filter(test => test.project === project).map(test => test.file).sort() })),
        { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'build' },
        ...['chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit'].map((taskId): PlannedCheck => ({ kind: 'catalog', taskId })),
      ],
      expansionReasons: [], wideningReasons: ['Shared rule core requires complete rule groups and browser consumers.'],
    }
  }
  const selected = new Set(associations.tests.filter(test => test.safetyReasons.length || test.subsystems.some(id => groups.has(id))).map(test => test.file))
  const projects = [...new Set(inventory.vitest.filter(test => selected.has(test.file)).map(test => test.project))].sort()
  if (!projects.length) return expand('No behavior tests cover the selected rule subsystems; full verification is required.')
  const browsers = [...new Set([
    ...[...groups].flatMap(id => id === 'core' ? [] : browserConsumers[id].map(name => `e2e-tests/${name}.spec.ts`)),
    ...inventory.browser.filter(file => selected.has(file)),
  ])].sort()
  const missing = [...browsers, 'e2e-tests/frontend-browser-scenario-matrix.spec.ts'].filter(file => !inventory.browser.includes(file))
  if (missing.length) throw new Error(`Declared rule browser consumers are missing: ${missing.join(', ')}`)
  return {
    checks: [
      ...projects.map((project): PlannedCheck => ({ kind: 'vitest', project, files: inventory.vitest.filter(test => test.project === project && selected.has(test.file)).map(test => test.file).sort() })),
      { kind: 'catalog', taskId: 'quality' }, { kind: 'catalog', taskId: 'build' }, { kind: 'catalog', taskId: 'browser-sandbox' },
      { kind: 'browser', browser: 'chromium', files: browsers, grep: null },
      { kind: 'browser', browser: 'webkit', files: ['e2e-tests/frontend-browser-scenario-matrix.spec.ts'], grep: '@webkit' },
    ],
    expansionReasons: [], wideningReasons: [`Complete rule subsystems and their shared safety consumers: ${ordered(groups).join(', ')}.`],
  }
}
