import type {
  ActionFlow,
  ActionSpace,
  AnytimeAction,
  FarmTilePosition,
  GameState,
  InteractionFarmSelection,
  InteractionSelection,
  InteractionState,
  PendingAction,
  PlayerState,
  Resource,
  InteractionAnimalReorgZone,
} from '../game/types.ts'
import type { ActionDetailParts } from '../protocol/game.ts'
import { actionDefinitions, getActionDefinition } from '../actions/index.ts'
import { internalActionDefinitions } from '../actions/internal-actions.ts'
import { clearActionHooks } from '../actions/hooks.ts'
import { processSubmit, tryAdvanceRound, finalizeDraft } from '../draft/draft-manager.ts'
import type { DraftPickPayload } from '../draft/types.ts'
import {
  ActionNode,
  ActionRegistry,
  ChoiceNode,
  Engine,
  EngineTree,
  HookDispatcher,
  LogStore,
  OptionalNode,
  OrNode,
  ParallelNode,
  PlayerSwitchNode,
  SequenceNode,
  XorNode,
} from '../engine/index.ts'
import type { EngineNode } from '../engine/index.ts'
import {
  createInitialState,
  createRoundOpenById,
  cloneState,
  emptyResources,
  harvestRounds,
  type InitialStateOptions,
  normalizeState,
  resourceKeyList,
  applyRoundGrowth,
  applyFutureMeeples,
} from '../logic/state.ts'
import { clearWorkPhaseBuildingResources } from '../logic/work-phase-resources.ts'
import {
  addFoodFromConversion,
  incFirstPlayer,
  incHarvestedGrain,
  incHarvestedVegetable,
  incPlacedFarmers,
  incResourceConverted,
  incRoomsBuilt,
  recordDraftPick,
} from '../logic/stats.ts'
import { getMinorImprovement } from '../game/minor-improvements.ts'
import {
  registerCustomCard,
  getCustomMinorImprovementIds,
  getCustomOccupationIds,
} from '../cards/custom-registry.ts'
import { type CustomCardData, SessionCardContext, withSessionContext } from '../cards/session-card-context.ts'
import { CardRegistry, type CardImpl } from '../cards/registry.ts'
import { getActiveCardRegistry, setActiveCardRegistry } from '../cards/active-registry.ts'
import { ALL_CARD_IMPLS } from '../cards/register-all.ts'
import { allOccupationCards, allMinorImprovementCards } from '../cards/catalog.ts'
import { majorCardDefinitions } from '../cards/major/index.ts'
import { getCardModifiers } from '../cards/card-modifiers.ts'
import { handleSowExtraField, collectLockedFarmTileKeys, getCardEffect } from '../cards/card-effects.ts'
import { collectComputeCostsForFarmChoice } from '../cards/card-listeners.ts'
import { incCardUsed, addCardResourceGained } from '../cards/helpers/card-state.ts'
import type { CardEffectHook } from '../cards/card-effects.ts'
import { runRoundEndHooks, runBeforeFeedHooks, runAfterFeedHooks, runCardEffectHook, runBeforeEndGameHooks, shouldSkipPlayerTurn } from '../cards/card-effects.ts'
import { positionKey } from '../game/farm.ts'
import { getMatchingListeners, executeCardListener, shouldSkipImmediateListenerLog } from '../cards/card-listeners.ts'
import { computeScores, type PlayerScoreSummary } from '../logic/scoring.ts'
import { computeAnimalZones } from '../actions/helpers/animal-zones'
import { reap } from '../actions/effects/reap.ts'
import { breedLeaf } from '../actions/effects/breed'
import { recordActionSnapshot } from '../cards/helpers/action-snapshot.ts'
import { releaseWorkerFromCard } from '../cards/helpers/card-held-workers.ts'
import { recordRoundPlacement, resetRoundPlacements } from '../cards/helpers/round-placement.ts'
import { familySize, newbornCount, workersAvailable } from '../game/player.ts'
import { getRegisteredMinorImprovement, getRegisteredOccupation } from '../cards/types.ts'
import { getExchangesInWindow } from '../actions/effects/exchange.ts'
import { getMajorCard } from '../cards/major/index.ts'
import {
  BASIC_CONVERSION_SOURCE_ID,
  getBasicConversionExchange,
} from '../cards/basic-conversion.ts'
import {
  normalizePlayerFarm,
} from '../logic/farm/fence-validation.ts'
import { applyFarmChoice, type FarmChoicePayloadMap } from '../logic/farm/farm-choice.ts'
import { playerCanBuildPalisades } from '../cards/helpers/card-type'
import {
  applyCostOverride,
  applyTradeSideEffect,
} from '../actions/helpers/payment'
import {
  isMajorImprovementPlayable,
  isMinorImprovementPlayable,
} from '../actions/effects/improvement.ts'
import {
  getOccupationActionCost,
  isOccupationPlayable,
} from '../actions/effects/occupation.ts'
import {
  resolveTypedFlatPaymentSelection,
} from '../actions/helpers/pay-helpers.ts'
import {
  buildRoomCostPerUnit,
  getMaxBuildableRooms,
  resolveRoomPaymentSelection,
} from '../actions/helpers/room-payment.ts'
import {
  getFenceCount,
  getPalisadeCount,
  stableWoodCost,
} from '../actions/effects/fencing.ts'
import {
  buildFarmPositionSelectionInteraction,
  buildFenceFarmInteraction,
  buildPlowFarmInteraction,
  buildRoomFarmInteraction,
  getPermittedExtraSowableFields,
  buildSowFarmInteraction,
  buildStableFarmInteraction,
} from '../logic/farm/farm-interaction.ts'
import { buildOccupationHandSelectionInteraction } from '../logic/farm/occupation-hand-interaction.ts'
import { readPendingFenceBonus } from '../cards/helpers/pending-fence-bonus.ts'
import { rebuildActiveModifiers } from '../game/serialization.ts'
import { addWorkerRef, isSpaceOccupied, removeWorkerRef } from '../game/space.ts'
import { smallestAvailableWorker } from '../game/player.ts'
import { computeAllowedPlacementSpaces } from '../actions/helpers/placement-availability.ts'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../actions/helpers/placement-constants.ts'
import { validatePlowSelection } from '../logic/farm/plow-validation.ts'
import { validateRoomSelection, validateStableSelection } from '../logic/farm/validators.ts'
import { validateFenceSelection } from '../logic/farm/fence-validation.ts'

type HistoryEntry = {
  state: GameState
  pending: PendingAction
  activeSpaceId: string | null
  activePlayerIndex: number | null
  engineSnapshot: ReturnType<Engine['snapshot']> | null
  engineSource: EngineSource | null
  stageResume: StageResumeState | null
  turnOwnerPlayerIndex: number | null
  actionStart: boolean
  undoBoundary?: boolean
}

type EngineSource =
  | { kind: 'action'; actionId: string }
  | { kind: 'flow'; flow: ActionFlow }

type StageResumeState = {
  hook:
    | 'onBeforeHarvest'
    | 'onAfterReap'
    | 'onHarvest'
    | 'onEndHarvest'
    | 'onAfterHarvest'
    | 'onBeforeStartOfTurn'
    | 'onRoundStart'
    | 'onStartHarvestFeedingPhase'
    | 'onEndTurn'
    | 'onReturnHome'
    | 'onStartReturnHome'
    | 'onAfterRoundEnd'
    | 'onStartHarvest'
    | 'onStartHarvestFieldPhase'
    | 'onHarvestFieldPhase'
    | 'onEndHarvestFieldPhase'
    | 'onHarvestFeedingPhase'
    | 'onEndHarvestFeedingPhase'
    | 'onBeforeReturnHome'
    | 'onAllWorkersPlaced'
    | 'onBreedPhase'
  playerIndex: number
  cardIndex: number
}

const sanitizePayableCost = (
  cost: Partial<Resource> | undefined,
): Partial<Resource> => {
  const payable: Partial<Resource> = {}
  Object.entries(cost ?? {}).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    payable[key as keyof Resource] = value
  })
  return payable
}

const scaleCost = (
  costPerUnit: Partial<Resource>,
  count: number,
): Partial<Resource> => {
  const total: Partial<Resource> = {}
  Object.entries(costPerUnit).forEach(([key, value]) => {
    if (typeof value !== 'number') return
    total[key as keyof Resource] = value * count
  })
  return sanitizePayableCost(total)
}

export type SessionResponse = {
  ok: boolean
  state: GameState
  pending: PendingAction
  interaction: InteractionState
  historyLength: number
  hasActionStartSnapshot: boolean
  scores?: PlayerScoreSummary[]
  pastureCapacities?: Record<string, Record<string, number>>
  actionAvailability?: Record<string, boolean>
  cardAvailability?: Record<string, boolean>
  error?: string
}

/**
 * Options for constructing a `GameCore`. Exported so that server-side
 * subclasses (`GameSession`) and other consumers can inject dependencies
 * without importing Node-only modules into the shared layer.
 */
export interface GameCoreOptions {
  /** Pre-built state (object) or deterministic seed (number). */
  stateOrSeed?: GameState | number
  /** Workshop custom cards to register into a per-session context. */
  customCards?: CustomCardData[]
  /** Options forwarded to `createInitialState`. */
  initialStateOptions?: InitialStateOptions
  /**
   * Optional extra registrar invoked during custom card registration. Server
   * passes its isolated-vm executor wrapper here; sandbox / browser contexts
   * leave it unset (defaults to a no-op).
   */
  registerCustomCardImpl?: (data: CustomCardData) => void
  /**
   * Optional pre-built per-session card registry. When omitted, `GameCore`
   * constructs a new `CardRegistry` and populates it from `ALL_CARD_IMPLS`.
   * The registry is published via `setActiveCardRegistry` so that any legacy
   * `registerCardListener` / `registerCardEffect` calls issued later (e.g.
   * custom-code cards at runtime) forward into this session's registry.
   */
  cardRegistry?: CardRegistry
}

export class GameCore {
  private state: GameState
  private engine: Engine | null = null
  private engineSource: EngineSource | null = null
  private activeSpaceId: string | null = null
  private activePlayerIndex: number | null = null
  private stageResume: StageResumeState | null = null
  private pending: PendingAction = { type: 'none' }
  private history: HistoryEntry[] = []
  private actionStartIndex: number | null = null
  private actionStartPlayerSnapshot: PlayerState | null = null
  /**
   * Accumulates resource gains/costs already attributed to specific cards via
   * `log.cardEffectGain` / `log.cardEffectPay` since the last leaf-flush.
   * `flushLeafActionDetail` subtracts these from the leaf's delta so card
   * effects don't get double-counted in the action's `log.actionDetail`.
   */
  private cardEffectDeltasSinceFlush: { gains: Partial<Resource>; costs: Partial<Resource> } = {
    gains: {},
    costs: {},
  }
  private nextActionToken = 1
  private deferredPlayerSwitch: { fromPlayerIndex: number; toPlayerIndex: number } | null = null
  private turnOwnerPlayerIndex: number | null = null

  private registry: ActionRegistry
  private hookDispatcher: HookDispatcher
  private engineLog: LogStore
  private sessionCardContext: SessionCardContext | null = null
  private readonly registerCustomCardImpl: (data: CustomCardData) => void
  private readonly cardRegistry: CardRegistry
  readonly cardWarnings: string[] = []

  constructor(options: GameCoreOptions = {}) {
    const { stateOrSeed, customCards, initialStateOptions, registerCustomCardImpl } = options
    this.registerCustomCardImpl = registerCustomCardImpl ?? (() => {
      // No-op default: used in sandbox mode (browser) or tests that don't need
      // the server-side executor-backed registrar.
    })
    this.registry = new ActionRegistry()
    actionDefinitions.forEach((a) => this.registry.register(a))
    internalActionDefinitions.forEach((a) => this.registry.register(a))
    clearActionHooks()
    this.hookDispatcher = new HookDispatcher()
    this.engineLog = new LogStore()

    // Build or accept a per-session card registry, then publish it as the
    // "active" registry so any subsequent `registerCardListener` /
    // `registerCardEffect` calls (e.g. from custom-code cards) forward into it.
    //
    // If an active registry already exists (e.g. test harness with
    // pre-registered stub listeners / effects), clone it so those entries
    // survive into the session without leaking mutations back to the outer
    // registry. Fall back to a fresh registry loaded with ALL_CARD_IMPLS
    // when no outer registry is active (production startup path).
    if (options.cardRegistry) {
      this.cardRegistry = options.cardRegistry
    } else {
      const existing = getActiveCardRegistry()
      if (existing) {
        this.cardRegistry = existing.clone()
      } else {
        this.cardRegistry = new CardRegistry()
        for (const [cardId, impl] of Object.entries(ALL_CARD_IMPLS)) {
          this.cardRegistry.loadImpl(cardId, impl as CardImpl)
        }
      }
    }
    // Sync modifier definitions from catalog into per-session registry.
    // Replaces the legacy card-modifiers.ts catalog-direct-query path; downstream
    // callers (`getCardModifiers`) read from `active.getModifiers` only.
    this.cardRegistry.syncModifiersFromCatalog(
      allOccupationCards,
      allMinorImprovementCards,
    )
    // Register majors as effect bundles so getCardEffect resolves them after
    // the legacy getMajorCardEffect fallback is removed.
    this.cardRegistry.registerEffects(majorCardDefinitions)
    setActiveCardRegistry(this.cardRegistry)

    // Register custom workshop cards into a per-session context (sandbox mode)
    if (customCards && customCards.length > 0) {
      this.sessionCardContext = new SessionCardContext()
      withSessionContext(this.sessionCardContext, () => {
        for (const cardData of customCards!) {
          try {
            registerCustomCard(cardData)
            this.registerCustomCardImpl(cardData)
          } catch (err) {
            const msg = `Failed to register card ${cardData.cardJson.id}: ${err instanceof Error ? err.message : String(err)}`
            console.warn(`[game-core] ${msg}`)
            this.cardWarnings.push(msg)
          }
        }
      })
    }

    if (stateOrSeed && typeof stateOrSeed === 'object') {
      this.state = normalizeState(stateOrSeed)
    } else {
      const seed = typeof stateOrSeed === 'number' ? stateOrSeed : undefined
      const extraMinorIds = withSessionContext(this.sessionCardContext, () => getCustomMinorImprovementIds())
      const extraOccupationIds = withSessionContext(this.sessionCardContext, () => getCustomOccupationIds())
      this.state = createInitialState(seed, {
        ...initialStateOptions,
        extraMinorIds,
        extraOccupationIds,
      })
    }
    this.syncDynamicActionSpaces()
  }

  private syncDynamicActionSpaces() {
    for (const space of this.state.actionSpaces) {
      if (!this.registry.get(space.id)) {
        this.registry.register(space)
      }
    }
  }

  /** Run a function with this session's card context active. */
  withCtx<T>(fn: () => T): T {
    return withSessionContext(this.sessionCardContext, fn)
  }

  /** Dispose of session resources. Call when replacing or removing a session. */
  dispose(): void {
    this.sessionCardContext?.dispose()
    this.sessionCardContext = null
  }

  /**
   * Export custom card definitions for the frontend.
   * Returns an array of { cardType, cardJson } for each custom card in this session.
   * Frontend uses this to register custom cards into its card registry so they
   * render identically to built-in cards.
   */
  getCustomCardDefs(): import('../protocol/game.ts').CustomCardDef[] {
    if (!this.sessionCardContext) return []
    const defs: import('../protocol/game.ts').CustomCardDef[] = []
    const artUrls = this.sessionCardContext.customArtUrls
    for (const [id, card] of this.sessionCardContext.customMinors) {
      defs.push({ cardType: 'minor', cardJson: card.toJSON(), artUrl: artUrls.get(id) ?? null })
    }
    for (const [id, card] of this.sessionCardContext.customOccupations) {
      defs.push({ cardType: 'occupation', cardJson: card.toJSON(), artUrl: artUrls.get(id) ?? null })
    }
    return defs
  }

  /** Update a player's display name in the game state (called after WS join). */
  updatePlayerName(playerIndex: number, name: string): void {
    const player = this.state.players[playerIndex]
    if (player && name.trim()) {
      player.name = name.trim()
    }
  }

  private buildEngineNode(flow: ActionFlow, counter: { value: number }): EngineNode {
    if (flow.type === 'playerSwitch') {
      return new PlayerSwitchNode(`ps-${counter.value++}`, flow.targetPlayerId)
    }
    if (flow.type === 'leaf') {
      const actionNode = new ActionNode(
        `action-${flow.actionId}-${counter.value++}`,
        flow.actionId,
        flow.sourceCard,
        flow.params,
        flow.choiceLabelKey,
        flow.choiceLabelParams,
        flow.actionContext,
      )
      const def = this.registry.get(flow.actionId)
      if (def?.resolveChoice && !def.skipChoiceWrap) {
        const seq = new SequenceNode(`seq-${flow.actionId}-${counter.value++}`, [
          actionNode,
          new ChoiceNode(`choice-${flow.actionId}-${counter.value++}`, []),
        ])
        return flow.optional ? new OptionalNode(`opt-${counter.value++}`, seq, flow.promptKey) : seq
      }
      return flow.optional
        ? new OptionalNode(`opt-${counter.value++}`, actionNode, flow.promptKey)
        : actionNode
    }

    const children = flow.children.map((child) => this.buildEngineNode(child, counter))
    if (flow.type === 'seq') {
      const seq = new SequenceNode(`seq-${counter.value++}`, children)
      return flow.optional ? new OptionalNode(`opt-${counter.value++}`, seq, flow.promptKey) : seq
    }
    if (flow.type === 'parallel') {
      const parallel = new ParallelNode(`par-${counter.value++}`, children)
      return flow.optional
        ? new OptionalNode(`opt-${counter.value++}`, parallel, flow.promptKey)
        : parallel
    }
    if (flow.type === 'xor') {
      const xor = new XorNode(`xor-${counter.value++}`, children, flow.promptKey)
      return flow.optional ? new OptionalNode(`opt-${counter.value++}`, xor, flow.promptKey) : xor
    }
    const or = new OrNode(`or-${counter.value++}`, children, flow.promptKey)
    return flow.optional ? new OptionalNode(`opt-${counter.value++}`, or, flow.promptKey) : or
  }

  private runPlaceFarmerAfterHooks(
    player: PlayerState,
    space: ActionSpace,
  ): boolean {
    const context = {
      state: this.state,
      player,
      space,
      actionId: 'place-farmer',
      phase: 'after' as const,
      result: { type: 'ok' as const },
    }
    const matched = getMatchingListeners(context)
    const counter = { value: 0 }
    const nodes: EngineNode[] = []
    for (const entry of matched) {
      const result = executeCardListener(entry.registration, context, {
        ownerPlayerId: entry.ownerPlayerId,
      })
      // Track BGA-style per-card `used` stat for the owner of the card whose
      // listener actually produced an effect. This place-farmer 'after' path
      // bypasses ActivateCardNode, so we book-keep here directly.
      if (result && entry.cardId) {
        const owner =
          this.state.players.find((candidate) => candidate.id === entry.ownerPlayerId) ?? player
        incCardUsed(owner, entry.cardId)
      }
      if (!result?.flow) continue
      if (result.logKey && !shouldSkipImmediateListenerLog(result)) {
        const logPlayer =
          this.state.players.find((candidate) => candidate.id === entry.ownerPlayerId) ?? player
        this.state.log.unshift({
          key: result.logKey,
          params: { player: logPlayer.name, ...result.logParams },
        })
      }
      const flowNode = this.buildEngineNode(result.flow, counter)
      const needsSwitch = entry.ownerPlayerId && entry.ownerPlayerId !== player.id
      if (needsSwitch) {
        nodes.push(
          new PlayerSwitchNode(`pf-ps-to-${counter.value++}`, entry.ownerPlayerId),
          flowNode,
          new PlayerSwitchNode(`pf-ps-back-${counter.value++}`, player.id),
        )
      } else {
        nodes.push(flowNode)
      }
    }
    if (nodes.length === 0) return false
    const root = nodes.length === 1 ? nodes[0] : new SequenceNode(`pf-after-seq`, nodes)
    this.engine = new Engine({
      tree: new EngineTree(root),
      registry: this.registry,
      hooks: this.hookDispatcher,
      log: this.engineLog,
    })
    this.engineSource = { kind: 'flow', flow: { type: 'seq', children: [] } }
    return true
  }

  private createFlowEngine(flow: ActionFlow): Engine {
    const counter = { value: 0 }
    return new Engine({
      tree: new EngineTree(this.buildEngineNode(flow, counter)),
      registry: this.registry,
      hooks: this.hookDispatcher,
      log: this.engineLog,
    })
  }

  private createEngine(actionId: string): Engine {
    const action = this.registry.get(actionId)
    const counter = { value: 0 }
    const an = new ActionNode(`action-${actionId}`, actionId)
    const root = action?.flow
      ? this.buildEngineNode(action.flow, counter)
      : action?.resolveChoice
        ? new SequenceNode(`seq-${actionId}`, [an, new ChoiceNode(`choice-${actionId}`, [])])
        : an
    return new Engine({
      tree: new EngineTree(root),
      registry: this.registry,
      hooks: this.hookDispatcher,
      log: this.engineLog,
    })
  }

  private createEngineFromSource(source: EngineSource): Engine {
    return source.kind === 'action'
      ? this.createEngine(source.actionId)
      : this.createFlowEngine(source.flow)
  }

  private clonePlayer(p: PlayerState): PlayerState {
    try { return structuredClone(p) } catch { return JSON.parse(JSON.stringify(p)) as PlayerState }
  }

  private getAnimalCount(p: PlayerState) {
    return p.resources.sheep + p.resources.boar + p.resources.cattle
  }

  private getAssignedAnimalCount(p: PlayerState) {
    const pasture = p.pastures.reduce((s, pa) => s + pa.animalCount, 0)
    const house = p.houseAnimalType && p.houseAnimalCount > 0 ? p.houseAnimalCount : 0
    const stable = Object.values(p.stableAnimals ?? {}).filter(Boolean).length
    return pasture + house + stable
  }

  private hasPendingAnimals(p: PlayerState) {
    return this.getAnimalCount(p) > this.getAssignedAnimalCount(p)
  }

  private nextPlayerIdx(players: PlayerState[], current: number) {
    for (let off = 1; off <= players.length; off++) {
      const idx = (current + off) % players.length
      const candidate = players[idx]
      if (candidate && workersAvailable(this.state, candidate) > 0) return idx
    }
    return current
  }

  private getStartPlayerIdx() {
    const startIdx = this.state.players.findIndex((player) => player.startPlayer)
    return startIdx === -1 ? 0 : startIdx
  }

  private getHarvestPlayerIndices() {
    const players = this.state.players
    const startIdx = this.getStartPlayerIdx()
    return players.map((_, offset) => (startIdx + offset) % players.length)
  }

  /**
   * True when the player has a card that flagged them to skip the field +
   * breeding phase of the current harvest. Cards register the skip by writing
   * `cardStates[CARD_ID].extraData.passFieldAndBreedRound = state.round` (e.g.
   * E58 LunchtimeBeer's onStartHarvest opt-in). The flag naturally expires
   * next round — we compare against the current round on every check.
   */
  private hasPassFieldAndBreed(player: PlayerState): boolean {
    const cardStates = player.cardStates ?? {}
    for (const cardId of Object.keys(cardStates)) {
      const round = cardStates[cardId]?.extraData?.passFieldAndBreedRound
      if (typeof round === 'number' && round === this.state.round) {
        return true
      }
    }
    return false
  }

  private hasPositiveResources(resources: Partial<Resource>) {
    return resourceKeyList.some((key) => (resources[key] ?? 0) > 0)
  }

  private logHarvestResourceEntry(key: string, player: PlayerState, resources: Partial<Resource>) {
    if (!this.hasPositiveResources(resources)) return
    this.state.log.unshift({
      key,
      params: {
        player: player.name,
        resources,
      },
    })
  }

  private hasAnyHarvestExchange(player: PlayerState) {
    return (
      getExchangesInWindow(player, 'harvest', this.state).length > 0 ||
      getExchangesInWindow(player, 'anytime', this.state).length > 0
    )
  }

  private findNextHarvestReorgPlayer(afterPlayerIndex: number) {
    const order = this.getHarvestPlayerIndices()
    const currentOrderIndex = order.indexOf(afterPlayerIndex)
    if (currentOrderIndex === -1) return -1
    for (let offset = 1; offset < order.length; offset += 1) {
      const nextIndex = order[(currentOrderIndex + offset) % order.length]
      const player = nextIndex === undefined ? null : this.state.players[nextIndex]
      if (player && this.hasPendingAnimals(player)) {
        return nextIndex
      }
    }
    return -1
  }

  private createSyntheticSpace(id: string): ActionSpace {
    return {
      id,
      nameKey: 'ui.interactionOptionalAction',
      descriptionKey: 'ui.interactionOptionalAction',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
      resources: { ...emptyResources },
      takenBy: [],
    }
  }

  private getSpaceById(spaceId: string | null): ActionSpace | null {
    if (!spaceId) return null
    return this.state.actionSpaces.find((item) => item.id === spaceId)
      ?? (spaceId.startsWith('__stage:') ? this.createSyntheticSpace(spaceId) : null)
  }

  private getPlayerEffectCardIds(player: PlayerState) {
    return [...player.improvements, ...player.minorPlayed, ...player.occupationPlayed]
  }

  /** Return hand card IDs whose registered effect declares `handHooks` containing `hook`. */
  private getPlayerHandEffectCardIds(player: PlayerState, hook: CardEffectHook) {
    const handCards = [...player.occupationHand, ...player.minorHand]
    return handCards.filter(id => {
      const effect = getCardEffect(id)
      return effect?.handHooks?.includes(hook)
    })
  }

  private getActiveInteractionContext() {
    if (this.activePlayerIndex === null || !this.activeSpaceId) return null
    const player = this.state.players[this.activePlayerIndex]
    const space = this.getSpaceById(this.activeSpaceId)
    if (!player || !space) return null
    return { player, space }
  }

  private isFarmPromptKey(promptKey?: string) {
    switch (promptKey) {
      case 'ui.interactionFenceSelect':
        return 'fence' as const
      case 'ui.interactionRoomSelect':
        return 'room' as const
      case 'ui.interactionStableSelect':
        return 'stable' as const
      case 'ui.interactionPlowSelect':
        return 'plow' as const
      case 'ui.interactionSowSelect':
        return 'sow' as const
      default:
        return null
    }
  }

  private isSelectionPromptKey(promptKey?: string) {
    switch (promptKey) {
      case 'ui.interactionSelection':
        return 'farm-position' as const
      case 'ui.interactionOccupationHand':
        return 'occupation-hand' as const
      default:
        return null
    }
  }

  private buildRoomInteraction(
    player: PlayerState,
    costOverride?: Partial<Resource>,
    actionContext?: Record<string, unknown>,
  ): InteractionFarmSelection {
    return buildRoomFarmInteraction(player, costOverride, actionContext)
  }

  private buildStableInteraction(
    player: PlayerState,
    costOverride?: Partial<Resource>,
    actionContext?: Record<string, unknown>,
  ): InteractionFarmSelection {
    const zoneFilter = actionContext?.zoneFilter
    const max = actionContext?.max
    return buildStableFarmInteraction(player, costOverride, {
      zoneFilter: zoneFilter === 'pasture-1' ? 'pasture-1' : undefined,
      max: typeof max === 'number' ? max : undefined,
    })
  }

  private buildPlowInteraction(player: PlayerState, costOverride?: Partial<Resource>): InteractionFarmSelection {
    return buildPlowFarmInteraction(player, costOverride)
  }

  private buildSowInteraction(player: PlayerState): InteractionFarmSelection {
    const actionContext = this.pending.type === 'choice' ? this.pending.actionContext : undefined
    return buildSowFarmInteraction(player, actionContext)
  }

  private buildFenceInteraction(pending: Extract<PendingAction, { type: 'choice' }>): InteractionFarmSelection {
    return buildFenceFarmInteraction(this.state.players[pending.playerIndex]!, pending)
  }

  private buildSelectionInteraction(player: PlayerState): InteractionSelection {
    const actionContext = this.pending.type === 'choice' ? this.pending.actionContext : undefined
    const kind = (actionContext?.selectionKind as string | undefined) ?? 'farm-position'
    if (kind === 'occupation-hand') {
      return buildOccupationHandSelectionInteraction(player, actionContext)
    }
    return buildFarmPositionSelectionInteraction(player, actionContext)
  }

  private buildFarmInteraction(
    pending: Extract<PendingAction, { type: 'choice' }>,
  ): InteractionFarmSelection | null {
    const farmType = this.isFarmPromptKey(pending.promptKey)
    const player = this.state.players[pending.playerIndex]
    if (!farmType || !player) return null
    switch (farmType) {
      case 'fence':
        return this.buildFenceInteraction(pending)
      case 'room':
        return this.buildRoomInteraction(player, pending.costOverride, pending.actionContext)
      case 'stable':
        return this.buildStableInteraction(player, pending.costOverride, pending.actionContext)
      case 'plow':
        return this.buildPlowInteraction(player, pending.costOverride)
      case 'sow':
        return this.buildSowInteraction(player)
      default:
        return null
    }
  }

  private buildAnytimeEntries(): { descriptor: AnytimeAction; flow: ActionFlow }[] {
    if (this.stageResume) return []
    const context = this.getActiveInteractionContext()
    if (!context) return []
    if (this.pending.type === 'animalReorg' || this.pending.type === 'harvestFeed') {
      return []
    }
    // Suppress anytime actions during sub-choice resolution (e.g. bake-bread, exchange)
    // to avoid recursive anytime interrupts
    if (
      this.pending.type === 'choice' &&
      this.pending.promptKey &&
      (this.pending.promptKey.startsWith('ui.interactionBakeBread') ||
       this.pending.promptKey.startsWith('ui.interactionExchange'))
    ) {
      return []
    }
    const { player, space } = context
    const anytimeEntries: { descriptor: AnytimeAction; flow: ActionFlow }[] = []
    // Auto-discover anytime actions from registry instead of hardcoding
    for (const action of this.registry.values()) {
      if (!action.anytime) continue
      const doable = this.hookDispatcher.applyIsDoable(
        { state: this.state, player, space, actionId: action.id },
        action,
        action.canBeExecutedByPlayer(this.state, player),
      )
      if (!doable) continue
      anytimeEntries.push({
        descriptor: {
          id: action.id,
          labelKey: action.nameKey,
          actionId: action.id,
        },
        flow: { type: 'leaf', actionId: action.id },
      })
    }
    // Card-sourced anytime actions via CardListener phases:['anytime']
    const anytimeContext: import('../cards/card-listeners').CardListenerContext = {
      state: this.state,
      player,
      space,
      actionId: 'anytime',
      phase: 'anytime',
    }
    const matchedAnytime = getMatchingListeners(anytimeContext)
    for (const entry of matchedAnytime) {
      if (!entry.cardId) continue
      if (entry.ownerPlayerId !== player.id) continue
      const result = executeCardListener(entry.registration, anytimeContext, {
        ownerPlayerId: entry.ownerPlayerId,
      })
      if (!result?.flow) continue
      // anytime listeners are queried during build (idempotent peek), not
      // fire — do not increment used here. The increment is done when the
      // player actually picks the anytime entry and triggers the flow.
      anytimeEntries.push({
        descriptor: {
          id: entry.registration.id,
          labelKey: result.labelKey ?? `cards.${entry.cardId}.anytime`,
          labelParams: result.labelParams,
          sourceCard: entry.cardId,
        },
        flow: result.flow,
      })
    }

    return anytimeEntries
  }

  private buildAnimalReorgZones(
    player: PlayerState,
  ): InteractionAnimalReorgZone[] {
    return computeAnimalZones(player).map((zone) => ({
      id: zone.id,
      zoneType: zone.zoneType as 'pasture' | 'house' | 'stable',
      animalType: (zone.animalType as 'sheep' | 'boar' | 'cattle' | null) ?? null,
      animalCount: zone.animalCount ?? 0,
      capacity: zone.capacity,
    }))
  }

  private buildInteraction(): InteractionState {
    // Fast paths: skip expensive anytime/farm computation for states that don't need them
    if (this.pending.type === 'animalReorg') {
      const player = this.state.players[this.pending.playerIndex]
      return {
        stateId: 'animalReorg',
        playerIndex: this.pending.playerIndex,
        spaceId: this.pending.spaceId,
        zones: player ? this.buildAnimalReorgZones(player) : [],
        allowedCommands: ['confirmReorg', 'undoStep', 'undoAction'],
        anytimeActions: [],
      }
    }
    if (this.pending.type === 'harvestFeed') {
      return {
        stateId: 'harvestFeed',
        playerIndex: this.pending.playerIndex,
        remaining: this.pending.remaining,
        foodUsed: this.pending.foodUsed,
        feedQueue: this.pending.feedQueue,
        allowedCommands: ['confirmFeed', 'undoStep', 'undoAction'],
        anytimeActions: [],
      }
    }
    if (this.pending.type === 'confirmNextPlayer') {
      return {
        stateId: 'confirmNextPlayer',
        nextPlayerIndex: this.pending.nextPlayerIndex,
        allowedCommands: ['confirmNextPlayer', 'undoStep', 'undoAction'],
        anytimeActions: [],
      }
    }
    if (this.pending.type === 'confirmPlayerSwitch') {
      return {
        stateId: 'confirmPlayerSwitch',
        fromPlayerIndex: this.pending.fromPlayerIndex,
        toPlayerIndex: this.pending.toPlayerIndex,
        allowedCommands: ['confirmPlayerSwitch', 'undoStep', 'undoAction'],
        anytimeActions: [],
      }
    }
    if (this.pending.type === 'cardDraft') {
      // Draft phase: no regular interaction commands (client uses DraftOverlay).
      return {
        stateId: 'idle',
        allowedCommands: [],
        anytimeActions: [],
      }
    }
    if (this.pending.type === 'none') {
      // Idle: only compute anytime actions (no farm interaction needed)
      const anytimeActions = this.buildAnytimeEntries().map((entry) => entry.descriptor)
      return {
        stateId: 'idle',
        allowedCommands: ['takeAction', 'undoStep', 'undoAction'],
        anytimeActions,
      }
    }
    // Choice state: compute both anytime and farm interaction
    const anytimeActions = this.buildAnytimeEntries().map((entry) => entry.descriptor)
    const selectionKind = this.isSelectionPromptKey(this.pending.promptKey)
    const selectionPlayer = this.state.players[this.pending.playerIndex]
    if (selectionKind && selectionPlayer) {
      return {
        stateId: 'selection',
        playerIndex: this.pending.playerIndex,
        spaceId: this.pending.spaceId,
        promptKey: this.pending.promptKey,
        promptParams: this.pending.promptParams,
        options: this.pending.options,
        costOverride: this.pending.costOverride,
        sourceCard: this.pending.sourceCard,
        selection: this.buildSelectionInteraction(selectionPlayer),
        allowedCommands: ['resolveChoice', 'commitSelection', 'takeAnytimeAction', 'undoStep', 'undoAction'],
        anytimeActions,
      }
    }
    const farm = this.buildFarmInteraction(this.pending)
    const allowedCommands = farm
      ? ['resolveChoice', 'commitFarm', 'takeAnytimeAction', 'undoStep', 'undoAction'] as const
      : ['resolveChoice', 'takeAnytimeAction', 'undoStep', 'undoAction'] as const
    if (farm) {
      return {
        stateId: 'farmSelect',
        playerIndex: this.pending.playerIndex,
        spaceId: this.pending.spaceId,
        promptKey: this.pending.promptKey,
        promptParams: this.pending.promptParams,
        options: this.pending.options,
        costOverride: this.pending.costOverride,
        sourceCard: this.pending.sourceCard,
        farm,
        allowedCommands: [...allowedCommands],
        anytimeActions,
      }
    }
    return {
      stateId: 'choice',
      playerIndex: this.pending.playerIndex,
      spaceId: this.pending.spaceId,
      promptKey: this.pending.promptKey,
      promptParams: this.pending.promptParams,
      options: this.pending.options,
      costOverride: this.pending.costOverride,
      sourceCard: this.pending.sourceCard,
      allowedCommands: [...allowedCommands],
      anytimeActions,
    }
  }

  private computeCardDraftPending(): Extract<PendingAction, { type: 'cardDraft' }> | null {
    if (this.state.phase !== 'draft' || !this.state.draft) return null
    const draft = this.state.draft
    const allSubmitted = draft.seatOrder.every(
      (pid) =>
        draft.pendingPicks[pid] != null &&
        draft.pendingPicks[pid].occ !== null &&
        draft.pendingPicks[pid].minor !== null,
    )
    return {
      type: 'cardDraft',
      round: draft.round,
      totalRounds: draft.totalRounds,
      allSubmitted,
    }
  }

  private respond(ok = true, error?: string): SessionResponse {
    // While the top-level game phase is 'draft', surface a cardDraft pending
    // regardless of `this.pending` — the engine/interaction paths are paused.
    const draftPending = this.computeCardDraftPending()
    const effectivePending: PendingAction = draftPending ?? this.pending
    // Keep the interaction computation aligned with the effective pending.
    const prevPending = this.pending
    if (draftPending) this.pending = draftPending
    const interaction = this.buildInteraction()
    if (draftPending) this.pending = prevPending
    const resp: SessionResponse = {
      ok,
      state: this.state,
      pending: effectivePending,
      interaction,
      historyLength: this.history.length,
      hasActionStartSnapshot: this.actionStartIndex !== null,
      scores: computeScores(this.state),
      pastureCapacities: this.getPastureCapacities(),
    }
    // Include backend-computed availability for current player
    if (!this.state.gameOver && effectivePending.type === 'none') {
      const actionAvailability = this.getActionAvailability(this.state.currentPlayerIndex)
      resp.actionAvailability = actionAvailability
      resp.cardAvailability = this.getCardAvailability(
        this.state.currentPlayerIndex,
        actionAvailability,
      )
    }
    if (error) resp.error = error
    return resp
  }

  private clonePending(pending: PendingAction): PendingAction {
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(pending)
      } catch {
        return JSON.parse(JSON.stringify(pending)) as PendingAction
      }
    }
    return JSON.parse(JSON.stringify(pending)) as PendingAction
  }

  private pushHistory(actionStart = false, undoBoundary = false) {
    // Cards can flag a one-shot undo boundary on state via `state.pendingUndoBoundary`
    // (e.g. immediately after rolling random). Merge it with the explicit parameter,
    // then clear the flag so it fires exactly once.
    const effectiveBoundary = undoBoundary || this.state.pendingUndoBoundary === true
    if (this.state.pendingUndoBoundary) {
      this.state.pendingUndoBoundary = false
    }
    const entry: HistoryEntry = {
      state: cloneState(this.state),
      pending: this.clonePending(this.pending),
      activeSpaceId: this.activeSpaceId,
      activePlayerIndex: this.activePlayerIndex,
      engineSnapshot: this.engine?.snapshot() ?? null,
      engineSource: this.engineSource
        ? JSON.parse(JSON.stringify(this.engineSource)) as EngineSource
        : null,
      stageResume: this.stageResume ? { ...this.stageResume } : null,
      turnOwnerPlayerIndex: this.turnOwnerPlayerIndex,
      actionStart,
      undoBoundary: effectiveBoundary,
    }
    this.history.push(entry)
    if (actionStart) {
      this.actionStartIndex = this.history.length - 1
    }
  }

  private restoreHistory(entry: HistoryEntry) {
    this.state = cloneState(entry.state)
    this.pending = this.clonePending(entry.pending)
    this.activeSpaceId = entry.activeSpaceId
    this.activePlayerIndex = entry.activePlayerIndex
    this.engineSource = entry.engineSource
      ? JSON.parse(JSON.stringify(entry.engineSource)) as EngineSource
      : null
    this.stageResume = entry.stageResume ? { ...entry.stageResume } : null
    this.turnOwnerPlayerIndex = entry.turnOwnerPlayerIndex
    if (entry.engineSnapshot && this.engineSource) {
      this.engine = this.createEngineFromSource(this.engineSource)
      this.engine.restore(entry.engineSnapshot)
    } else {
      this.engine = null
    }
  }

  private recomputeActionStartIndex() {
    for (let i = this.history.length - 1; i >= 0; i -= 1) {
      if (this.history[i]?.actionStart) {
        this.actionStartIndex = i
        return
      }
    }
    this.actionStartIndex = null
  }

  private buildRoundSnapshot(state: GameState): GameState {
    const snapshot = cloneState(state)
    // workers return home at round start — just clear action space occupancy.
    snapshot.actionSpaces.forEach((space) => { space.takenBy = [] })
    snapshot.roundStartSnapshot = null
    return snapshot
  }

  private buildActionDetailParts(before: PlayerState, player: PlayerState) {
    const gains: Resource = { ...emptyResources }
    const costs: Resource = { ...emptyResources }
    resourceKeyList.forEach((key) => {
      const delta = player.resources[key] - before.resources[key]
      if (delta > 0) gains[key] = delta
      if (delta < 0) costs[key] = Math.abs(delta)
    })
    const effects: NonNullable<ActionDetailParts['effects']> = {}
    const bonusSources = player._activeActionBonusSources
      ? [...player._activeActionBonusSources]
      : undefined
    if (player.rooms > before.rooms) {
      effects.buildRoom = player.rooms - before.rooms
    }
    const beforeSize = familySize(before)
    const afterSize = familySize(player)
    if (afterSize > beforeSize) {
      effects.growFamily = afterSize - beforeSize
    }
    if (player.fields.length > before.fields.length) {
      effects.plow = player.fields.length - before.fields.length
    }
    let sowGrain = 0
    let sowVegetable = 0
    const beforeFieldMap = new Map(
      before.fields.map((field) => [positionKey({ row: field.row, col: field.col }), field]),
    )
    player.fields.forEach((field) => {
      const beforeField = beforeFieldMap.get(
        positionKey({ row: field.row, col: field.col }),
      )
      if (beforeField && beforeField.stacks.length > 0) return
      const top = field.stacks[field.stacks.length - 1]
      if (top?.kind === 'grain') sowGrain += 1
      if (top?.kind === 'vegetable') sowVegetable += 1
    })
    if (sowGrain > 0) effects.sowGrain = sowGrain
    if (sowVegetable > 0) effects.sowVegetable = sowVegetable
    if (player.houseType !== before.houseType) {
      effects.renovate = { from: before.houseType, to: player.houseType }
    }
    const fenceDelta = getFenceCount(player) - getFenceCount(before)
    const palisadeDelta = getPalisadeCount(player) - getPalisadeCount(before)
    if (fenceDelta > 0) effects.fencing = fenceDelta
    if (palisadeDelta > 0) effects.palisading = palisadeDelta
    const stablesBefore = before.stableTiles?.length ?? 0
    const stablesAfter = player.stableTiles?.length ?? 0
    if (stablesAfter > stablesBefore) {
      effects.buildStables = stablesAfter - stablesBefore
    }
    const newImprovements = player.improvements.filter(
      (id) => !before.improvements.includes(id),
    )
    if (newImprovements.length > 0) {
      effects.improvements = newImprovements
    }
    const newMinorImprovements = player.minorPlayed.filter(
      (id) => !before.minorPlayed.includes(id),
    )
    if (newMinorImprovements.length > 0) {
      effects.minorImprovements = newMinorImprovements
    }
    if (!before.startPlayer && player.startPlayer) {
      effects.startPlayer = true
    }
    const bakedGrain = costs.grain ?? 0
    const bakedFood = gains.food ?? 0
    if (bakedGrain > 0 && bakedFood > 0) {
      effects.bakeBread = { count: bakedGrain, food: bakedFood }
    }
    const result = { gains, costs, effects } as ActionDetailParts & {
      gains: Resource
      costs: Resource
      effects: NonNullable<ActionDetailParts['effects']>
    }
    if (bonusSources && bonusSources.length > 0) {
      result.bonusSources = bonusSources
    }
    return result
  }

  private logActionDetail(before: PlayerState, player: PlayerState) {
    if (!this.activeSpaceId) return
    const space = this.getSpaceById(this.activeSpaceId)
    if (!space) return
    const detailParts = this.buildActionDetailParts(before, player)
    const hasGains = resourceKeyList.some((key) => (detailParts.gains[key] ?? 0) > 0)
    const hasCosts = resourceKeyList.some((key) => (detailParts.costs[key] ?? 0) > 0)
    const hasEffects = Object.keys(detailParts.effects ?? {}).length > 0
    if (
      detailParts.effects?.improvements
      || detailParts.effects?.minorImprovements
      || detailParts.effects?.bakeBread
    ) return
    if (!hasGains && !hasCosts && !hasEffects) return
    this.state.log.unshift({
      key: 'log.actionDetail',
      params: {
        player: player.name,
        action: space.nameKey,
        detailParts,
      },
    })
  }

  /**
   * Mid-flow flush: when a leaf ActionNode inside a SEQ/optional flow finishes,
   * emit a partial `log.actionDetail` for that sub-action and advance the
   * baseline snapshot. Subsequent leaves and the final aggregate then only see
   * the residual delta, avoiding duplicate logs.
   *
   * Skipped when:
   *   - no active snapshot (no in-flight action),
   *   - leaf actionId equals the top-level activeSpaceId (the wrapper itself),
   *   - the action wrote its own logKey (e.g. `log.sow`, `log.buildStable`),
   *   - the resulting delta is already covered by a dedicated immediate log
   *     (for example improvement / bake-bread).
   */
  private flushLeafActionDetail(
    actionId: string | undefined,
    hasOwnLogKey: boolean,
  ) {
    if (!actionId) return
    if (!this.actionStartPlayerSnapshot) return
    if (this.activePlayerIndex === null) return
    if (actionId === this.activeSpaceId) return
    if (hasOwnLogKey) return
    const def = getActionDefinition(actionId)
    if (!def?.emitLeafActionDetail) return
    const player = this.state.players[this.activePlayerIndex]
    if (!player) return
    const before = this.actionStartPlayerSnapshot
    const detailParts = this.buildActionDetailParts(before, player)
    for (const key of resourceKeyList) {
      const cardGain = this.cardEffectDeltasSinceFlush.gains[key] ?? 0
      const cardCost = this.cardEffectDeltasSinceFlush.costs[key] ?? 0
      if (cardGain > 0) {
        detailParts.gains[key] = Math.max(0, (detailParts.gains[key] ?? 0) - cardGain)
      }
      if (cardCost > 0) {
        detailParts.costs[key] = Math.max(0, (detailParts.costs[key] ?? 0) - cardCost)
      }
    }
    this.cardEffectDeltasSinceFlush = { gains: {}, costs: {} }
    const hasGains = resourceKeyList.some((key) => (detailParts.gains[key] ?? 0) > 0)
    const hasCosts = resourceKeyList.some((key) => (detailParts.costs[key] ?? 0) > 0)
    const hasEffects = Object.keys(detailParts.effects ?? {}).length > 0
    if (
      detailParts.effects?.improvements
      || detailParts.effects?.minorImprovements
      || detailParts.effects?.bakeBread
    ) {
      this.actionStartPlayerSnapshot = this.clonePlayer(player)
      return
    }
    if (!hasGains && !hasCosts && !hasEffects) {
      player._activeActionBonusSources = []
      this.actionStartPlayerSnapshot = this.clonePlayer(player)
      return
    }
    const labelKey = def.nameKey ?? `actions.${actionId}.name`
    this.state.log.unshift({
      key: 'log.actionDetail',
      params: {
        player: player.name,
        action: labelKey,
        detailParts,
      },
    })
    player._activeActionBonusSources = []
    this.actionStartPlayerSnapshot = this.clonePlayer(player)
  }

  private flushEngineLog() {
    const entries = this.engineLog.all()
    if (entries.length > 0) {
      const toAdd = entries.filter((e) => e.key !== 'log.action')
      for (const entry of toAdd) {
        if (entry.key === 'log.cardEffectGain') {
          const gain = (entry.params as { gain?: Partial<Resource> } | undefined)?.gain
          if (gain) this.accumulateCardEffectDelta('gains', gain)
        } else if (entry.key === 'log.cardEffectPay') {
          const cost = (entry.params as { cost?: Partial<Resource> } | undefined)?.cost
          if (cost) this.accumulateCardEffectDelta('costs', cost)
        }
      }
      for (let i = toAdd.length - 1; i >= 0; i--) {
        this.state.log.unshift(toAdd[i])
      }
      this.engineLog.clear()
    }
  }

  private accumulateCardEffectDelta(
    bucket: 'gains' | 'costs',
    delta: Partial<Resource>,
  ) {
    const target = this.cardEffectDeltasSinceFlush[bucket]
    for (const [key, value] of Object.entries(delta)) {
      if (typeof value !== 'number' || value <= 0) continue
      const k = key as keyof Resource
      target[k] = (target[k] ?? 0) + value
    }
  }

  private finalizeActionLog(player: PlayerState) {
    const before = this.actionStartPlayerSnapshot
    if (before) {
      this.logActionDetail(before, player)
    }
    this.actionStartPlayerSnapshot = null
    delete player._activeActionBonusSources
  }

  private startStageFlow(
    flow: ActionFlow,
    hook: StageResumeState['hook'],
    playerIndex: number,
    nextCardIndex: number,
  ) {
    this.engine = this.createFlowEngine(flow)
    this.engineSource = { kind: 'flow', flow }
    this.activeSpaceId = `__stage:${hook}`
    this.activePlayerIndex = playerIndex
    this.stageResume = { hook, playerIndex, cardIndex: nextCardIndex }
    this.pending = { type: 'none' }
    this.runEngineSteps()
  }

  private continueStageHook(
    hook: StageResumeState['hook'],
    playerIndex = 0,
    cardIndex = 0,
  ) {
    for (let currentPlayerIndex = playerIndex; currentPlayerIndex < this.state.players.length; currentPlayerIndex += 1) {
      const player = this.state.players[currentPlayerIndex]
      if (!player) continue
      const cards = [
        ...this.getPlayerEffectCardIds(player),
        ...this.getPlayerHandEffectCardIds(player, hook as CardEffectHook),
      ]
      const startCardIndex = currentPlayerIndex === playerIndex ? cardIndex : 0
      for (let currentCardIndex = startCardIndex; currentCardIndex < cards.length; currentCardIndex += 1) {
        const cardId = cards[currentCardIndex]
        if (!cardId) continue
        const flow = runCardEffectHook(this.state, player, cardId, hook as CardEffectHook)
        if (!flow) continue
        this.startStageFlow(flow, hook, currentPlayerIndex, currentCardIndex + 1)
        return true
      }
    }
    return false
  }

  private continueSinglePlayerStageHook(
    hook: StageResumeState['hook'],
    playerIndex: number,
    cardIndex = 0,
  ) {
    const player = this.state.players[playerIndex]
    if (!player) return false
    const cards = this.getPlayerEffectCardIds(player)
    for (let currentCardIndex = cardIndex; currentCardIndex < cards.length; currentCardIndex += 1) {
      const cardId = cards[currentCardIndex]
      if (!cardId) continue
      const flow = runCardEffectHook(this.state, player, cardId, hook as CardEffectHook)
      if (!flow) continue
      this.startStageFlow(flow, hook, playerIndex, currentCardIndex + 1)
      return true
    }
    return false
  }

  private finishCompletedActionTurn(playerIndex: number): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')
    this.finalizeActionLog(player)
    this.turnOwnerPlayerIndex = null
    this.activeSpaceId = null
    this.activePlayerIndex = null
    const allWorkersUsed = this.state.players.every((p) => workersAvailable(this.state, p) <= 0)
    if (!allWorkersUsed) {
      const next = this.nextPlayerIdx(this.state.players, this.state.currentPlayerIndex)
      this.pending = { type: 'confirmNextPlayer', nextPlayerIndex: next }
    } else {
      const startIdx = this.state.players.findIndex((p) => p.startPlayer)
      this.pending = { type: 'confirmNextPlayer', nextPlayerIndex: startIdx === -1 ? 0 : startIdx }
    }
    return this.respond()
  }

  private continueEndTurnHooks(playerIndex: number, cardIndex = 0): SessionResponse {
    if (this.continueSinglePlayerStageHook('onEndTurn', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.finishCompletedActionTurn(playerIndex)
  }

  private continueHarvestFromBeforeHarvest(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onBeforeHarvest', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueFromStartHarvest()
  }

  private continueFromStartHarvest(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onStartHarvest', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueHarvestFieldStart()
  }

  private continueHarvestFieldStart(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (playerIndex === 0 && cardIndex === 0) {
      this.state.roundPhase = 'field'
      this.state.log.unshift({ key: 'log.harvestPhaseReap' })
    }
    if (this.continueStageHook('onStartHarvestFieldPhase', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueHarvestFieldPhase()
  }

  private continueHarvestFieldPhase(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onHarvestFieldPhase', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueHarvestReap()
  }

  private continueHarvestReap(): SessionResponse {
    this.state.harvestReapSummary = {}
    const harvestOrder = this.getHarvestPlayerIndices()
    harvestOrder.forEach((index) => {
      const player = this.state.players[index]
      if (!player) return
      // E58 LunchtimeBeer (and any future card) may flag a player to skip
      // the field phase of the current harvest. Flagged players are not reaped.
      if (this.hasPassFieldAndBreed(player)) return
      const result = reap(this.state, player)
      this.state.harvestReapSummary![player.id] = result.reapSummary
      incHarvestedGrain(player, result.reapSummary.resources.grain ?? 0)
      incHarvestedVegetable(player, result.reapSummary.resources.vegetable ?? 0)
      this.logHarvestResourceEntry('log.harvestReapDetail', player, result.reapSummary.resources)
    })
    return this.continueAfterReapEffects()
  }

  private continueAfterReapEffects(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onAfterReap', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueEndFieldPhase()
  }

  private continueEndFieldPhase(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onEndHarvestFieldPhase', playerIndex, cardIndex)) {
      return this.respond()
    }
    delete this.state.harvestReapSummary
    this.state.roundPhase = 'harvest'
    return this.continueHarvestEffects()
  }

  private continueHarvestEffects(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onHarvest', playerIndex, cardIndex)) {
      return this.respond()
    }

    this.state.roundPhase = 'feeding'
    if (this.continueStageHook('onStartHarvestFeedingPhase')) {
      return this.respond()
    }
    return this.continueHarvestFeeding()
  }

  private continueHarvestFeeding(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (playerIndex === 0 && cardIndex === 0) {
      this.state.log.unshift({ key: 'log.harvestPhaseFeed' })
      const harvestOrder = this.getHarvestPlayerIndices()
      harvestOrder.forEach((index) => {
        const player = this.state.players[index]
        if (player) runBeforeFeedHooks(this.state, player)
      })
    }
    if (this.continueStageHook('onHarvestFeedingPhase', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.executeFeedingLogic()
  }

  private executeFeedingLogic(): SessionResponse {
    const harvestOrder = this.getHarvestPlayerIndices()
    const feedQueue: { index: number; remaining: number; foodUsed: number }[] = []

    for (const i of harvestOrder) {
      const player = this.state.players[i]!
      const size = familySize(player)
      const newborn = Math.min(newbornCount(player), size)
      const required = Math.max(0, size * 2 - newborn)
      const useFood = Math.min(player.resources.food, required)
      player.resources.food -= useFood
      const remaining = required - useFood

      const hasHarvestExchange = this.hasAnyHarvestExchange(player)

      if (remaining <= 0) {
        // Even when feeding is satisfied, give the player a chance to
        // engage harvest exchanges (e.g. C105 reverse trade spending bonus
        // food → resources). Only skip if there's nothing useful to do.
        if (!hasHarvestExchange) {
          if (useFood > 0) {
            this.logHarvestResourceEntry('log.harvestFeedDetail', player, { food: useFood })
          }
          continue
        }
        feedQueue.push({ index: i, remaining: 0, foodUsed: useFood })
        continue
      }

      const canConvert =
        player.resources.grain > 0 ||
        player.resources.vegetable > 0 ||
        hasHarvestExchange

      if (canConvert) {
        feedQueue.push({ index: i, remaining, foodUsed: useFood })
      } else {
        player.resources.begging += remaining
        this.logHarvestResourceEntry('log.harvestFeedDetail', player, {
          food: useFood,
          begging: remaining,
        })
      }
    }

    if (feedQueue.length > 0) {
      const first = feedQueue[0]!
      this.pending = {
        type: 'harvestFeed',
        playerIndex: first.index,
        remaining: first.remaining,
        foodUsed: first.foodUsed,
        feedQueue: feedQueue.slice(1),
      }
      return this.respond()
    }

    return this.startBreedPhase()
  }

  private continueEndHarvestEffects(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onEndHarvest', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueAfterHarvestEffects()
  }

  private continueAfterHarvestEffects(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onAfterHarvest', playerIndex, cardIndex)) {
      return this.respond()
    }
    delete this.state.harvestBreedSummary
    return this.finalizeRound()
  }

  private continueBeforeStartOfTurn(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onBeforeStartOfTurn', playerIndex, cardIndex)) {
      return this.respond()
    }
    this.state.players.forEach((player) => resetRoundPlacements(player))
    applyRoundGrowth(this.state)
    applyFutureMeeples(this.state)
    if (this.continueStageHook('onRoundStart')) {
      return this.respond()
    }
    const startIdx = this.state.players.findIndex((player) => player.startPlayer)
    this.state.currentPlayerIndex = startIdx === -1 ? 0 : startIdx
    if (this.state.round >= 2 && startIdx >= 0) {
      incFirstPlayer(this.state.players[startIdx]!)
    }
    this.state.roundPhase = 'work'
    this.state.log.unshift({ key: 'log.enterRound', params: { round: this.state.round } })
    this.state.roundStartSnapshot = this.buildRoundSnapshot(this.state)
    this.pending = { type: 'none' }
    this.engine = null
    this.engineSource = null
    this.activeSpaceId = null
    this.activePlayerIndex = null
    this.stageResume = null
    this.history = []
    this.actionStartIndex = null
    return this.respond()
  }

  private resumeStageFlow(stageResume: StageResumeState) {
    switch (stageResume.hook) {
      case 'onBeforeHarvest':
        this.continueHarvestFromBeforeHarvest(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onAfterReap':
        this.continueAfterReapEffects(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onHarvest':
        this.continueHarvestEffects(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onEndHarvest':
        this.continueEndHarvestEffects(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onAfterHarvest':
        this.continueAfterHarvestEffects(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onBeforeStartOfTurn':
        this.continueBeforeStartOfTurn(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onRoundStart':
        this.continueBeforeStartOfTurn(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onStartHarvestFeedingPhase':
        this.continueHarvestEffects(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onEndTurn':
        this.continueEndTurnHooks(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onBeforeReturnHome':
        this.continueBeforeReturnHomeHooks(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onReturnHome':
        this.continueReturnHomeHooks(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onStartReturnHome':
        this.continueStartReturnHomeHooks(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onAfterRoundEnd':
        this.continueAfterRoundEnd(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onStartHarvest':
        this.continueFromStartHarvest(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onStartHarvestFieldPhase':
        this.continueHarvestFieldStart(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onHarvestFieldPhase':
        this.continueHarvestFieldPhase(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onEndHarvestFieldPhase':
        this.continueEndFieldPhase(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onHarvestFeedingPhase':
        this.continueHarvestFeeding(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onEndHarvestFeedingPhase':
        this.continueAfterFeedingPhase(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onAllWorkersPlaced':
        this.continueAllWorkersPlacedHooks(stageResume.playerIndex, stageResume.cardIndex)
        return
      case 'onBreedPhase':
        this.continueEndHarvestEffects()
        return
    }
  }

  private runEngineSteps(): void {
    if (!this.engine || this.activePlayerIndex === null || !this.activeSpaceId) return
    let player = this.state.players[this.activePlayerIndex]
    let space = this.getSpaceById(this.activeSpaceId)
    if (!player || !space) return

    while (true) {
      const before = this.clonePlayer(player)
      const step = this.engine!.proceed({ state: this.state, player, space })
      this.flushEngineLog()

      if (step.type === 'blocked' || step.type === 'done') {
        this.deferredPlayerSwitch = null
        const isActionEngine = this.engineSource?.kind === 'action'
        const stageResume = this.stageResume
        this.engine = null
        this.engineSource = null
        if (stageResume) {
          this.stageResume = null
          this.pending = { type: 'none' }
          this.activeSpaceId = null
          this.activePlayerIndex = null
          this.resumeStageFlow(stageResume)
          return
        }
        if (isActionEngine && this.runPlaceFarmerAfterHooks(player, space)) {
          continue
        }
        if (this.hasPendingAnimals(player)) {
          this.pending = { type: 'animalReorg', playerIndex: this.activePlayerIndex, spaceId: this.activeSpaceId }
          return
        }
        if (this.turnOwnerPlayerIndex !== null) {
          const ownerIndex = this.turnOwnerPlayerIndex
          this.pending = { type: 'none' }
          this.finalizeActionLog(player)
          this.activeSpaceId = null
          this.activePlayerIndex = null
          this.continueEndTurnHooks(ownerIndex)
          return
        }
        this.finalizeActionLog(player)
        return
      }

      if (step.type === 'playerSwitch') {
        const toIndex = this.state.players.findIndex((p) => p.id === step.targetPlayerId)
        if (toIndex !== -1 && toIndex !== this.activePlayerIndex) {
          this.pushHistory(false, true)
          const fromIndex = this.activePlayerIndex!
          this.activePlayerIndex = toIndex
          player = this.state.players[this.activePlayerIndex]!
          space = this.getSpaceById(this.activeSpaceId!) ?? space
          this.deferredPlayerSwitch = { fromPlayerIndex: fromIndex, toPlayerIndex: toIndex }
        }
        continue
      }

      if (step.type === 'choice') {
        // Lazy confirmation: if we silently switched players and now hit a choice,
        // show confirmPlayerSwitch first. The ChoiceNode stays unresolved in the engine.
        if (this.deferredPlayerSwitch) {
          this.pending = {
            type: 'confirmPlayerSwitch',
            fromPlayerIndex: this.deferredPlayerSwitch.fromPlayerIndex,
            toPlayerIndex: this.deferredPlayerSwitch.toPlayerIndex,
          }
          this.deferredPlayerSwitch = null
          return
        }
        if (step.choice.options.length === 1) {
          let autoOptions = step.choice.options
          while (autoOptions.length === 1) {
            const auto = autoOptions[0]
            const resolvedActionId = this.engine?.snapshot().pendingChoiceActionId ?? undefined
            const result = this.engine!.resolveChoice(auto.value, { state: this.state, player, space })
            this.flushEngineLog()
            if (result.type === 'ok' && resolvedActionId) {
              this.flushLeafActionDetail(resolvedActionId, Boolean(result.logKey))
            }
            if (result.type === 'choice') {
              if ((result.options?.length ?? 0) === 1) {
                autoOptions = result.options!
                continue
              }
              this.pending = {
                type: 'choice', playerIndex: this.activePlayerIndex, spaceId: this.activeSpaceId,
                options: result.options ?? [], promptKey: result.promptKey,
                promptParams: result.promptParams,
                costOverride: this.engine?.getLastComputedCosts(),
                sourceCard: this.engine?.snapshot().pendingChoiceContext?.sourceCard ?? undefined,
                actionContext: this.engine?.snapshot().pendingChoiceContext?.actionContext ?? undefined,
              }
              return
            }
            if (result.type === 'fail') {
              this.pending = { type: 'none' }
              this.engine = null
              this.engineSource = null
              this.stageResume = null
              this.actionStartIndex = null
              return
            }
            if (this.getAnimalCount(player) > this.getAnimalCount(before)) {
              this.pending = { type: 'animalReorg', playerIndex: this.activePlayerIndex, spaceId: this.activeSpaceId }
              return
            }
            break
          }
          continue
        }
        this.pending = {
          type: 'choice', playerIndex: this.activePlayerIndex, spaceId: this.activeSpaceId,
          options: step.choice.options, promptKey: step.choice.promptKey,
          promptParams: step.choice.promptParams,
          costOverride: this.engine?.getLastComputedCosts(),
          sourceCard: this.engine?.snapshot().pendingChoiceContext?.sourceCard ?? undefined,
          actionContext: this.engine?.snapshot().pendingChoiceContext?.actionContext ?? undefined,
        }
        return
      }

      if (step.type === 'ok' && step.result.type === 'animalReorg') {
        this.pending = {
          type: 'animalReorg',
          playerIndex: this.activePlayerIndex,
          spaceId: step.result.sourceId,
        }
        return
      }

      if (step.type === 'ok' && step.result.type === 'fail') {
        if (!this.stageResume) {
          removeWorkerRef(space, player.id)
        }
        this.engine = null
        this.engineSource = null
        this.pending = { type: 'none' }
        this.actionStartIndex = null
        this.actionStartPlayerSnapshot = null
        delete player._activeActionBonusSources
        this.turnOwnerPlayerIndex = null
        return
      }

      if (step.type === 'ok' && step.result.type === 'ok') {
        this.flushLeafActionDetail(step.actionId, Boolean(step.result.logKey))
      }

      if (this.getAnimalCount(player) > this.getAnimalCount(before)) {
        this.pending = { type: 'animalReorg', playerIndex: this.activePlayerIndex, spaceId: this.activeSpaceId }
        return
      }
    }
  }

  getState(): SessionResponse {
    return this.respond()
  }

  private isActionSpaceAvailableToPlayer(player: PlayerState, space: ActionSpace, roundOpen: Map<string, number>): boolean {
    const openRound = roundOpen.get(space.id) ?? space.roundAvailable
    if (this.state.round < openRound) return false
    if (workersAvailable(this.state, player) <= 0) return false
    if (isSpaceOccupied(space)) {
      const allowed = computeAllowedPlacementSpaces(this.state, player)
      if (!allowed.some(a => a.spaceId === space.id)) return false
    }
    return this.hookDispatcher.applyIsDoable(
      { state: this.state, player, space, actionId: space.id },
      space,
      space.canBeExecutedByPlayer(this.state, player),
    )
  }

  getAvailableActions(playerIndex: number): { spaceId: string; nameKey: string }[] {
    const player = this.state.players[playerIndex]
    if (!player) return []
    const roundOpen = createRoundOpenById(this.state.roundActionOrder)
    return this.state.actionSpaces
      .filter((space) => this.isActionSpaceAvailableToPlayer(player, space, roundOpen))
      .map((space) => ({ spaceId: space.id, nameKey: space.nameKey }))
  }

  /**
   * Compute which action spaces can be executed by the current player.
   * Returns a map of spaceId -> isExecutable for all action spaces.
   */
  getActionAvailability(playerIndex: number): Record<string, boolean> {
    const player = this.state.players[playerIndex]
    if (!player) return {}

    const roundOpen = createRoundOpenById(this.state.roundActionOrder)
    const result: Record<string, boolean> = {}

    for (const space of this.state.actionSpaces) {
      result[space.id] = this.isActionSpaceAvailableToPlayer(player, space, roundOpen)
    }

    // Also mark occupied spaces that computeArgs listeners expose as extra options
    if (workersAvailable(this.state, player) > 0) {
      const listenerContext: import('../cards/card-listeners.ts').CardListenerContext = {
        state: this.state,
        player,
        space: this.state.actionSpaces[0],
        actionId: 'place-farmer',
        phase: 'computeArgs',
      }
      const matched = getMatchingListeners(listenerContext)
      for (const entry of matched) {
        const r = executeCardListener(entry.registration, listenerContext, {
          ownerPlayerId: entry.ownerPlayerId,
        })
        if (!r?.extraOptions) continue
        for (const opt of r.extraOptions) {
          if (opt.value.startsWith(OCCUPIED_SPACE_CHOICE_PREFIX)) {
            const spaceId = opt.value.slice(OCCUPIED_SPACE_CHOICE_PREFIX.length)
            if (!result[spaceId]) {
              result[spaceId] = true
            }
          }
        }
      }
    }

    return result
  }

  getCardAvailability(
    playerIndex: number,
    actionAvailability = this.getActionAvailability(playerIndex),
  ): Record<string, boolean> {
    const player = this.state.players[playerIndex]
    if (!player) return {}

    const canUseMinorImprovement =
      actionAvailability['meeting-place'] === true ||
      actionAvailability['wish-children'] === true
    const canUseImprovementAny =
      actionAvailability['major-improvement'] === true ||
      actionAvailability['house-redevelopment'] === true

    const occupationCosts: { spaceId: string; cost: Partial<Resource> }[] = []
    if (actionAvailability.lessons === true) {
      occupationCosts.push({
        spaceId: 'lessons',
        cost: getOccupationActionCost(player, 'lessons'),
      })
    }
    if (actionAvailability['lessons-4'] === true) {
      occupationCosts.push({
        spaceId: 'lessons-4',
        cost: getOccupationActionCost(player, 'lessons-4'),
      })
    }

    const result: Record<string, boolean> = {}

    player.occupationHand.forEach((occupationId) => {
      result[`occupation:${occupationId}`] = occupationCosts.some(({ spaceId, cost }) =>
        isOccupationPlayable(this.state, player, occupationId, cost, spaceId),
      )
    })

    player.minorHand.forEach((improvementId) => {
      result[`minor:${improvementId}`] =
        (canUseMinorImprovement &&
          isMinorImprovementPlayable(
            this.state,
            player,
            improvementId,
            'minor-improvement',
          )) ||
        (canUseImprovementAny &&
          isMinorImprovementPlayable(
            this.state,
            player,
            improvementId,
            'improvement-any',
          ))
    })

    this.state.availableMajorImprovements.forEach((improvementId) => {
      result[`major:${improvementId}`] =
        canUseImprovementAny &&
        isMajorImprovementPlayable(
          this.state,
          player,
          improvementId,
          'improvement-any',
        )
    })

    return result
  }

  getPastureCapacities(): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {}
    this.state.players.forEach((player) => {
      const zones = computeAnimalZones(player)
      result[player.id] = Object.fromEntries(
        zones.filter((z) => z.zoneType === 'pasture').map((z) => [z.id, z.capacity]),
      )
    })
    return result
  }

  takeAction(playerIndex: number, spaceId: string): SessionResponse {
    if (this.state.gameOver) return this.respond(false, 'game is over')
    if (this.state.phase === 'draft') return this.respond(false, 'draft in progress')
    if (this.pending.type !== 'none') return this.respond(false, 'interaction in progress')
    if (playerIndex !== this.state.currentPlayerIndex) return this.respond(false, 'not your turn')
    const player = this.state.players[playerIndex]
    if (!player || workersAvailable(this.state, player) <= 0) return this.respond(false, 'no workers available')
    const space = this.state.actionSpaces.find((s) => s.id === spaceId)
    if (!space) return this.respond(false, 'space unavailable')
    if (isSpaceOccupied(space)) {
      const allowed = computeAllowedPlacementSpaces(this.state, player)
      if (!allowed.some(a => a.spaceId === spaceId)) return this.respond(false, 'space unavailable')
    }

    this.pushHistory(true)
    this.turnOwnerPlayerIndex = playerIndex
    player._activeActionBonusSources = []
    this.actionStartPlayerSnapshot = this.clonePlayer(player)
    this.cardEffectDeltasSinceFlush = { gains: {}, costs: {} }
    recordActionSnapshot(player, this.nextActionToken++)
    const worker = smallestAvailableWorker(this.state, player)
    if (worker) {
      addWorkerRef(space, player.id, worker.id)
    }
    recordRoundPlacement(player, spaceId, worker?.id ?? '?')
    incPlacedFarmers(player)
    this.state.log.unshift({ key: 'log.placeFarmer', params: { player: player.name, action: space.nameKey } })

    this.engine = this.createEngine(spaceId)
    this.engineSource = { kind: 'action', actionId: spaceId }
    this.activeSpaceId = spaceId
    this.activePlayerIndex = playerIndex
    this.stageResume = null

    const beforeListenerContext = {
      state: this.state,
      player,
      space,
      actionId: spaceId,
      phase: 'before' as const,
    }
    const matched = getMatchingListeners(beforeListenerContext)
    const beforeFlowNodes: EngineNode[] = []
    for (const entry of matched) {
      const result = executeCardListener(entry.registration, beforeListenerContext, {
        ownerPlayerId: entry.ownerPlayerId,
      })
      if (result?.flow) {
        beforeFlowNodes.push(this.engine.buildFlowNodePublic(result.flow))
      }
    }
    if (beforeFlowNodes.length > 0) {
      const injectedIds = new Set(beforeFlowNodes.map(n => n.id))
      this.engine.injectBeforeNodes(beforeFlowNodes)
      let safety = beforeFlowNodes.length * 3
      while (safety-- > 0 && this.engine) {
        const next = this.engine.peekNextUnresolved()
        if (!next || !injectedIds.has(next.id)) break
        const step = this.engine.proceed({ state: this.state, player, space })
        this.flushEngineLog()
        if (step.type !== 'ok') break
      }
      player._activeActionBonusSources = []
      this.actionStartPlayerSnapshot = this.clonePlayer(player)
    }

    this.runEngineSteps()
    return this.respond()
  }

  takeAnytimeAction(playerIndex: number, actionId: string): SessionResponse {
    if (this.state.gameOver) return this.respond(false, 'game is over')
    if (playerIndex !== this.state.currentPlayerIndex) return this.respond(false, 'not your turn')
    if (!this.engine || this.activePlayerIndex === null || !this.activeSpaceId) {
      return this.respond(false, 'no active interaction to interrupt')
    }
    const entry = this.buildAnytimeEntries().find(
      (candidate) => candidate.descriptor.id === actionId,
    )
    if (!entry) {
      return this.respond(false, 'anytime action unavailable')
    }
    this.pushHistory()
    this.pending = { type: 'none' }
    this.engine.prependFlow(entry.flow)
    this.runEngineSteps()
    return this.respond()
  }

  private resolvePendingChoice(
    playerIndex: number,
    value: string,
    pushHistoryEntry: boolean,
  ): SessionResponse {
    const pending = this.pending
    if (pending.type !== 'choice' || pending.playerIndex !== playerIndex) {
      return this.respond(false, 'no pending choice for this player')
    }
    // Reject attempts to resolve a choice with an option that's been marked disabled
    // (e.g. B3 Moonshine's "play" option when the player can't afford 2 food).
    const chosenOption = pending.options.find((o) => o.value === value)
    if (chosenOption?.disabled) {
      return this.respond(false, 'option disabled')
    }
    if (!this.engine) {
      if (pending.promptKey === 'ui.interactionFenceSelect' && value === 'cancel') {
        this.pending = { type: 'none' }
        return this.respond()
      }
      return this.respond(false, 'no active engine')
    }
    const player = this.state.players[playerIndex]
    const space = this.getSpaceById(this.activeSpaceId)
    if (!player || !space) return this.respond(false, 'invalid state')

    const farmPaymentResponse = this.resolvePendingFarmPaymentChoice(playerIndex, value)
    if (farmPaymentResponse) {
      return farmPaymentResponse
    }

    if (pushHistoryEntry) {
      this.pushHistory()
    }
    // Card-effect resolveChoice hook: if the pending choice has a sourceCard with a
    // registered CardEffect.resolveChoice, give the card a chance to produce a follow-up
    // ActionFlow that runs after the engine's own choice resolution.
    if (pending.sourceCard) {
      const cardEffect = getCardEffect(pending.sourceCard)
      if (cardEffect?.resolveChoice) {
        const cardFlow = cardEffect.resolveChoice(this.state, player, value, {
          sourceCard: pending.sourceCard,
          actionContext: pending.actionContext,
        })
        if (cardFlow && this.engine) {
          // Insert the follow-up so it runs after the engine finishes resolving the choice.
          // Mirrors the `{ type: 'flow' }` branch of the engine's own resolveChoice.
          this.engine.insertFlowAfterPendingChoice(cardFlow)
        }
      }
    }
    const resolvedActionId = this.engine.snapshot().pendingChoiceActionId ?? undefined
    const result = this.engine.resolveChoice(value, { state: this.state, player, space })
    this.flushEngineLog()
    if (result.type === 'ok' && resolvedActionId) {
      this.flushLeafActionDetail(resolvedActionId, Boolean(result.logKey))
    }
    if (result.type === 'choice') {
      this.pending = {
        type: 'choice', playerIndex, spaceId: this.activeSpaceId!,
        options: result.options ?? [], promptKey: result.promptKey,
        promptParams: result.promptParams,
        costOverride: this.engine.getLastComputedCosts(),
        sourceCard: this.engine.snapshot().pendingChoiceContext?.sourceCard ?? undefined,
        actionContext: this.engine.snapshot().pendingChoiceContext?.actionContext ?? undefined,
      }
      return this.respond()
    }
    if (result.type === 'animalReorg') {
      this.pending = {
        type: 'animalReorg',
        playerIndex,
        spaceId: result.sourceId,
      }
      return this.respond()
    }
    if (result.type === 'fail') {
      this.pending = { type: 'none' }
      this.engine = null
      this.engineSource = null
      this.stageResume = null
      this.actionStartIndex = null
      this.actionStartPlayerSnapshot = null
      delete player._activeActionBonusSources
      this.turnOwnerPlayerIndex = null
      return this.respond()
    }
    this.runEngineSteps()
    return this.respond()
  }

  resolveChoice(playerIndex: number, value: string): SessionResponse {
    return this.resolvePendingChoice(playerIndex, value, true)
  }

  startDevFenceSelect(playerIndex: number): SessionResponse {
    if (this.state.gameOver) return this.respond(false, 'game is over')
    if (playerIndex !== this.state.currentPlayerIndex) return this.respond(false, 'not your turn')
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')
    if (this.pending.type !== 'none') return this.respond(false, 'pending action exists')
    this.pending = {
      type: 'choice',
      playerIndex,
      spaceId: 'dev-create-pasture',
      promptKey: 'ui.interactionFenceSelect',
      options: [
        { value: 'confirm', labelKey: 'ui.interactionFenceConfirm' },
        { value: 'cancel', labelKey: 'ui.interactionFenceCancel' },
      ],
    }
    return this.respond()
  }

  confirmAnimalReorg(playerIndex: number, zones: {
    id: string; zoneType: 'pasture' | 'house' | 'stable'
    animalType: 'sheep' | 'boar' | 'cattle' | null; animalCount: number
  }[]): SessionResponse {
    if (this.pending.type !== 'animalReorg' || this.pending.playerIndex !== playerIndex) {
      return this.respond(false, 'no pending reorg')
    }
    this.pushHistory()
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')

    const totals = zones.reduce((acc, z) => {
      if (z.animalType) acc[z.animalType] += z.animalCount
      return acc
    }, { sheep: 0, boar: 0, cattle: 0 })

    const computedZones = computeAnimalZones(player)
    const zoneCapacity = (id: string) => computedZones.find((z) => z.id === id)?.capacity ?? 0
    const pastureZones = zones.filter((z) => z.zoneType === 'pasture')
    player.pastures = player.pastures.map((pasture) => {
      const assigned = pastureZones.find((z) => z.id === pasture.id)
      if (!assigned || !assigned.animalType) return { ...pasture, animalType: null, animalCount: 0 }
      const capacity = zoneCapacity(pasture.id)
      const count = Math.max(0, Math.min(capacity, assigned.animalCount))
      return { ...pasture, animalType: count > 0 ? assigned.animalType : null, animalCount: count }
    })
    const houseZone = zones.find((z) => z.zoneType === 'house')
    player.houseAnimalType = houseZone?.animalType ?? null
    player.houseAnimalCount = houseZone?.animalType && houseZone.animalCount > 0 ? 1 : 0
    const stableAnimals: Record<string, 'sheep' | 'boar' | 'cattle' | null> = {}
    zones.filter((z) => z.zoneType === 'stable').forEach((z) => {
      stableAnimals[z.id.replace('stable:', '')] = z.animalType ?? null
    })
    player.stableAnimals = stableAnimals
    player.resources.sheep = totals.sheep
    player.resources.boar = totals.boar
    player.resources.cattle = totals.cattle

    const source = this.pending.spaceId
    if (source === 'anytime-reorg') {
      this.pending = { type: 'none' }
      if (this.engine) {
        this.runEngineSteps()
        return this.respond()
      }
      return this.respond()
    }
    if (source === 'returning-home') {
      const nextPending = this.state.players.findIndex((p) => this.hasPendingAnimals(p))
      if (nextPending !== -1) {
        this.pending = { type: 'animalReorg', playerIndex: nextPending, spaceId: 'returning-home' }
        return this.respond()
      }
      if (harvestRounds.includes(this.state.round)) {
        return this.startHarvest()
      }
      return this.finalizeRound()
    }
    if (source === 'harvest-breed') {
      const nextPending = this.findNextHarvestReorgPlayer(this.pending.playerIndex)
      if (nextPending !== -1) {
        this.pending = { type: 'animalReorg', playerIndex: nextPending, spaceId: 'harvest-breed' }
        return this.respond()
      }
      return this.continueEndHarvestEffects()
    }
    if (this.engine) {
      this.runEngineSteps()
      return this.respond()
    }
    if (this.turnOwnerPlayerIndex !== null) {
      this.continueEndTurnHooks(this.turnOwnerPlayerIndex)
      return this.respond()
    }
    this.finalizeActionLog(player)
    const allWorkersUsed = this.state.players.every((p) => workersAvailable(this.state, p) <= 0)
    if (!allWorkersUsed) {
      const next = this.nextPlayerIdx(this.state.players, this.state.currentPlayerIndex)
      this.pending = { type: 'confirmNextPlayer', nextPlayerIndex: next }
    }
    return this.respond()
  }

  confirmHarvestFeed(
    playerIndex: number,
    selections: {
      count: number
      sourceName?: string
      sourceId: string
      /** Entry-index pointer into card.exchanges[] (D3 unified path). */
      exchangeIndex: number
    }[],
  ): SessionResponse {
    if (this.pending.type !== 'harvestFeed' || this.pending.playerIndex !== playerIndex) {
      return this.respond(false, 'no pending feed')
    }
    this.pushHistory()
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')

    // Resolve each selection to its underlying CardExchange entry through the
    // unified (sourceId, exchangeIndex) path. The synthetic '__basic__'
    // sourceId resolves to the basic-conversion exchange table; everything
    // else looks up the player's played majors / minors / occupations.
    const lookupExchange = (
      sourceId: string,
      idx: number,
    ): import('../cards/types').CardExchange | undefined => {
      if (sourceId === BASIC_CONVERSION_SOURCE_ID) {
        return getBasicConversionExchange(idx)
      }
      let card:
        | { exchanges?: readonly import('../cards/types').CardExchange[] }
        | undefined
      if (player.improvements.includes(sourceId)) card = getMajorCard(sourceId)
      else if (player.minorPlayed.includes(sourceId)) card = getRegisteredMinorImprovement(sourceId)
      else if (player.occupationPlayed.includes(sourceId)) card = getRegisteredOccupation(sourceId)
      return card?.exchanges?.[idx]
    }

    // Enforce per-card exchange `max` (sourceId-level aggregate cap so that
    // multi-tier cards like D62 BeerTap collapse to one tier per harvest).
    const perSourceUsed = new Map<string, number>()
    type ResolvedSel = (typeof selections)[number] & {
      _exchange?: import('../cards/types').CardExchange
    }
    const cappedSelections: ResolvedSel[] = selections.map((sel) => {
      if (!sel.sourceId || sel.count <= 0) return sel
      const exchange = lookupExchange(sel.sourceId, sel.exchangeIndex)
      if (!exchange) return sel
      let capped = sel.count
      if (exchange.max !== undefined) {
        const usedSoFar = perSourceUsed.get(sel.sourceId) ?? 0
        const remaining = Math.max(0, exchange.max - usedSoFar)
        capped = Math.min(sel.count, remaining)
        perSourceUsed.set(sel.sourceId, usedSoFar + capped)
      }
      return { ...sel, count: capped, _exchange: exchange }
    })

    let totalFood = 0
    const usedResources: Partial<Resource> = { food: this.pending.foodUsed }
    for (const sel of cappedSelections) {
      if (sel.count <= 0) continue
      const exchange = sel._exchange
      if (exchange) {
        // Bidirectional application: subtract `from`, add `to`. Caps per-key
        // by player's available resources (per-key `from` quantity allowed).
        let times = sel.count
        for (const [k, v] of Object.entries(exchange.from)) {
          const need = (v as number) * times
          const have = (player.resources as Record<string, number>)[k] ?? 0
          if (need > have) {
            // Scale down to whole-times that the player can actually afford.
            times = Math.min(times, Math.floor(have / Math.max(1, v as number)))
          }
        }
        if (times <= 0) continue
        // Subtract `from`
        const costMap: Record<string, number> = {}
        for (const [k, v] of Object.entries(exchange.from)) {
          const total = (v as number) * times
          ;(player.resources as Record<string, number>)[k] -= total
          costMap[k] = total
          usedResources[k as keyof Resource] = (usedResources[k as keyof Resource] ?? 0) + total
          incResourceConverted(player, k as keyof Resource, total)
        }
        // Add `to`
        const gainMap: Record<string, number> = {}
        for (const [k, v] of Object.entries(exchange.to)) {
          const total = (v as number) * times
          ;(player.resources as Record<string, number>)[k] += total
          gainMap[k] = total
          if (k === 'food') {
            totalFood += total
            // Per-key conversion stat: only meaningful for forward (* -> food)
            // trades; reverse trades log under usedResources but skip food
            // conversion stats.
            const fromKey0 = (Object.keys(exchange.from)[0] ?? null) as
              | keyof Resource
              | null
            if (fromKey0) addFoodFromConversion(player, fromKey0, total)
          }
        }
        this.state.log.unshift({
          key: 'log.harvestFeedConvert',
          params: {
            player: player.name,
            source: sel.sourceName ?? 'Harvest conversion',
            cost: costMap,
            food: gainMap,
          },
        })
        // Dispatch CardExchange.sideEffect (e.g. E153 StoneSculptor bonusVp).
        if (exchange.sideEffect && times > 0) {
          applyTradeSideEffect(
            this.state,
            player,
            exchange.sideEffect,
            times,
            sel.sourceId ?? exchange.sourceId ?? 'unknown',
          )
        }
      }
    }
    const required = this.pending.remaining
    const deficit = Math.max(0, required - totalFood)
    if (deficit > 0) {
      player.resources.begging += deficit
      usedResources.begging = (usedResources.begging ?? 0) + deficit
    }
    this.logHarvestResourceEntry('log.harvestFeedDetail', player, usedResources)

    const feedQueue = this.pending.feedQueue ?? []
    if (feedQueue.length > 0) {
      const next = feedQueue[0]!
      this.pending = { 
        type: 'harvestFeed', 
        playerIndex: next.index, 
        remaining: next.remaining,
        foodUsed: next.foodUsed,
        feedQueue: feedQueue.slice(1)
      }
      return this.respond()
    }

    return this.startBreedPhase()
  }

  confirmPlayerSwitch(): SessionResponse {
    if (this.pending.type !== 'confirmPlayerSwitch') return this.respond(false, 'no pending player switch')
    this.pushHistory(false, true)
    this.activePlayerIndex = this.pending.toPlayerIndex
    this.deferredPlayerSwitch = null
    this.pending = { type: 'none' }
    this.runEngineSteps()
    return this.respond()
  }

  confirmNextPlayer(): SessionResponse {
    if (this.pending.type !== 'confirmNextPlayer') return this.respond(false, 'no pending transition')
    this.pushHistory()
    this.state.currentPlayerIndex = this.pending.nextPlayerIndex
    this.pending = { type: 'none' }
    this.engine = null
    this.engineSource = null
    this.activeSpaceId = null
    this.activePlayerIndex = null
    this.stageResume = null
    this.actionStartIndex = null
    this.history = [] // Clear undo history when switching players
    this.turnOwnerPlayerIndex = null

    // Mirrors BGA `stLabor()` SkipNext consumption: dispatch
    // `onBeforePlayerTurn` for the freshly-active player; if any card asks to
    // skip, advance to the next eligible player. Cap at `players.length` to
    // guarantee termination if every player is asked to skip.
    let safety = this.state.players.length
    while (safety-- > 0) {
      const allWorkersUsedNow = this.state.players.every((p) => workersAvailable(this.state, p) <= 0)
      if (allWorkersUsedNow) break
      const current = this.state.players[this.state.currentPlayerIndex]
      if (!current) break
      if (workersAvailable(this.state, current) <= 0) {
        const next = this.nextPlayerIdx(this.state.players, this.state.currentPlayerIndex)
        if (next === this.state.currentPlayerIndex) break
        this.state.currentPlayerIndex = next
        continue
      }
      if (!shouldSkipPlayerTurn(this.state, current)) break
      this.state.log.unshift({
        key: 'log.playerSkipped',
        params: { playerName: current.name },
      })
      const next = this.nextPlayerIdx(this.state.players, this.state.currentPlayerIndex)
      if (next === this.state.currentPlayerIndex) break
      this.state.currentPlayerIndex = next
    }

    // Check if all workers are used (round end condition)
    const allWorkersUsed = this.state.players.every((p) => workersAvailable(this.state, p) <= 0)
    if (allWorkersUsed) {
      return this.continueAllWorkersPlacedHooks()
    }

    return this.respond()
  }

  private continueAllWorkersPlacedHooks(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onAllWorkersPlaced', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.performRoundEnd()
  }

  performRoundEnd(): SessionResponse {
    const allUsed = this.state.players.every((p) => workersAvailable(this.state, p) <= 0)
    if (!allUsed) return this.respond(false, 'not all workers used')
    if (this.pending.type !== 'none') return this.respond(false, 'pending action exists')

    const pendingAnimal = this.state.players.findIndex((p) => this.hasPendingAnimals(p))
    if (pendingAnimal !== -1) {
      this.pending = { type: 'animalReorg', playerIndex: pendingAnimal, spaceId: 'round-end' }
      return this.respond()
    }

    this.pushHistory()
    this.state.roundPhase = 'returning-home'
    return this.continueBeforeReturnHomeHooks()
  }

  private continueBeforeReturnHomeHooks(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onBeforeReturnHome', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueStartReturnHomeHooks()
  }

  private continueStartReturnHomeHooks(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onStartReturnHome', playerIndex, cardIndex)) {
      return this.respond()
    }
    return this.continueReturnHomeHooks()
  }

  private continueReturnHomeHooks(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onReturnHome', playerIndex, cardIndex)) {
      return this.respond()
    }
    this.state.players.forEach((p) => clearWorkPhaseBuildingResources(this.state, p.id))
    // workersAvailable is derived from workers[]; clearing takenBy returns workers home.
    this.state.actionSpaces.forEach((s) => { s.takenBy = [] })
    // Release any workers that cards were holding (e.g. C22_BasketChair).
    for (const p of this.state.players) {
      const cardStates = p.cardStates ?? {}
      for (const cardId of Object.keys(cardStates)) {
        releaseWorkerFromCard(p, cardId)
      }
    }

    const pendingAnimal = this.state.players.findIndex((p) => this.hasPendingAnimals(p))
    if (pendingAnimal !== -1) {
      this.pending = { type: 'animalReorg', playerIndex: pendingAnimal, spaceId: 'returning-home' }
      return this.respond()
    }

    if (harvestRounds.includes(this.state.round)) {
      return this.startHarvest()
    }
    return this.finalizeRound()
  }

  private startHarvest(): SessionResponse {
    this.state.roundPhase = 'harvest'
    this.state.log.unshift({ key: 'log.harvest', params: { round: this.state.round } })
    return this.continueHarvestFromBeforeHarvest()
  }

  private startBreedPhase(): SessionResponse {
    this.state.roundPhase = 'breeding'
    return this.continueAfterFeedingPhase()
  }

  private continueAfterFeedingPhase(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onEndHarvestFeedingPhase', playerIndex, cardIndex)) {
      return this.respond()
    }
    const harvestOrder = this.getHarvestPlayerIndices()
    harvestOrder.forEach((index) => {
      const player = this.state.players[index]
      if (player) runAfterFeedHooks(this.state, player)
    })
    this.state.log.unshift({ key: 'log.harvestPhaseBreed' })
    this.state.harvestBreedSummary = {}

    // E58 LunchtimeBeer-style cards opt out of breeding for the current round.
    const breedOrder = harvestOrder.filter((index) => {
      const p = this.state.players[index]
      return p ? !this.hasPassFieldAndBreed(p) : false
    })
    const flow = this.buildHarvestBreedFlow(breedOrder)
    if (flow) {
      this.startStageFlow(flow, 'onBreedPhase', 0, 0)
      return this.respond()
    }
    return this.continueEndHarvestEffects()
  }

  private buildHarvestBreedFlow(harvestOrder: number[]): ActionFlow | null {
    const players = harvestOrder
      .map((idx) => this.state.players[idx])
      .filter((p): p is PlayerState => !!p)
    if (players.length === 0) return null
    const children: ActionFlow[] = []
    for (const p of players) {
      children.push({ type: 'playerSwitch', targetPlayerId: p.id })
      children.push(breedLeaf('harvest'))
    }
    if (children.length === 1) {
      return children[0]
    }
    return { type: 'seq', children }
  }

  private finalizeRound(): SessionResponse {
    this.state.roundPhase = 'preparation'
    this.state.players.forEach((p) => runRoundEndHooks(this.state, p))
    return this.continueAfterRoundEnd()
  }

  private continueAfterRoundEnd(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onAfterRoundEnd', playerIndex, cardIndex)) {
      return this.respond()
    }
    this.state.players.forEach((p) => {
      for (const w of p.workers) {
        if (w.isActive) w.isNewborn = false
      }
    })
    this.state.round += 1
    if (this.state.round > 14) {
      this.state.players.forEach((p) => runBeforeEndGameHooks(this.state, p))
      this.state.gameOver = true
      this.state.log.unshift({ key: 'log.gameOver' })
      this.pending = { type: 'none' }
      return this.respond()
    }
    return this.continueBeforeStartOfTurn()
  }

  /**
   * Record a single player's card pick for the current draft round. When all
   * seated players have submitted, the round advances (pools rotate) and, once
   * the final round is complete, `finalizeDraft` copies each player's `kept`
   * cards back to `occupationHand` / `minorHand` and flips `phase='playing'`.
   *
   * No-op for non-draft phases, unknown players, out-of-pool picks, or double
   * submits in the same round — each returns `ok:false` with an error message.
   */
  submitDraftPick(playerId: string, pick: DraftPickPayload): SessionResponse {
    if (this.state.phase !== 'draft' || !this.state.draft) {
      return this.respond(false, 'not in draft phase')
    }
    const sub = processSubmit(this.state.draft, playerId, pick)
    if (sub.error) {
      return this.respond(false, sub.error)
    }
    this.state.draft = sub.draft
    const player = this.state.players.find((p) => p.id === playerId)
    if (player) {
      const draftTurn = this.state.draft.round
      recordDraftPick(player, pick.occCardId, draftTurn)
      recordDraftPick(player, pick.minorCardId, draftTurn)
    }
    const advance = tryAdvanceRound(this.state.draft)
    this.state.draft = advance.draft
    if (advance.finished) {
      this.state = finalizeDraft(this.state)
      // Refresh round-start snapshot so that subsequent takeAction / undo logic
      // sees the post-draft hands rather than the initial empty-handed snapshot.
      this.state.roundStartSnapshot = this.buildRoundSnapshot(this.state)
    }
    return this.respond()
  }

  loadState(raw: unknown): SessionResponse {
    this.state = rebuildActiveModifiers(normalizeState(raw as GameState))
    this.syncDynamicActionSpaces()
    if (!this.state.roundStartSnapshot) {
      this.state.roundStartSnapshot = this.buildRoundSnapshot(this.state)
    }
    this.engine = null
    this.engineSource = null
    this.stageResume = null
    this.activeSpaceId = null
    this.activePlayerIndex = null
    this.pending = { type: 'none' }
    this.history = []
    this.actionStartIndex = null
    this.turnOwnerPlayerIndex = null
    return this.respond()
  }

  getStateForRead(): Readonly<GameState> {
    return this.state
  }

  private continueAfterResolvedFarmChoice(
    playerIndex: number,
    farmChoiceMeta?: Record<string, unknown>,
  ): SessionResponse {
    if (!this.engine) {
      this.pending = { type: 'none' }
      return this.respond()
    }

    const space = this.getSpaceById(this.activeSpaceId)
    const updatedPlayer = this.state.players[playerIndex]!
    if (!space) return this.respond(false, 'invalid state')

    const resultOverride =
      farmChoiceMeta && Object.keys(farmChoiceMeta).length > 0
        ? { type: 'ok' as const, extraData: farmChoiceMeta }
        : undefined
    const result = this.engine.resolveChoice(
      'confirm',
      { state: this.state, player: updatedPlayer, space },
      resultOverride,
    )
    this.flushEngineLog()

    if (result.type === 'choice') {
      this.pending = {
        type: 'choice', playerIndex, spaceId: this.activeSpaceId!,
        options: result.options ?? [], promptKey: result.promptKey,
        promptParams: result.promptParams,
        costOverride: this.engine.getLastComputedCosts(),
        sourceCard: this.engine.snapshot().pendingChoiceContext?.sourceCard ?? undefined,
        actionContext: this.engine.snapshot().pendingChoiceContext?.actionContext ?? undefined,
      }
      return this.respond()
    }
    if (result.type === 'animalReorg') {
      this.pending = {
        type: 'animalReorg',
        playerIndex,
        spaceId: result.sourceId,
      }
      return this.respond()
    }
    if (result.type === 'fail') {
      this.pending = { type: 'none' }
      this.engine = null
      this.engineSource = null
      this.stageResume = null
      this.actionStartIndex = null
      return this.respond()
    }

    this.runEngineSteps()
    return this.respond()
  }

  private resolvePendingFarmPaymentChoice(
    playerIndex: number,
    value: string,
  ): SessionResponse | null {
    if (this.pending.type !== 'choice') return null
    const farmPayment = this.pending.actionContext?.farmPayment as
      | {
          farmType?: 'fence' | 'room' | 'stable' | 'plow'
          payload?: Record<string, unknown>
        }
      | undefined
    if (
      !farmPayment ||
      (farmPayment.farmType !== 'fence' &&
        farmPayment.farmType !== 'room' &&
        farmPayment.farmType !== 'stable' &&
        farmPayment.farmType !== 'plow')
    ) {
      return null
    }

    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')

    const normalized = normalizePlayerFarm(player)
    const space = this.getSpaceById(this.activeSpaceId) ?? undefined
    const result = applyFarmChoice(normalized, farmPayment.farmType, farmPayment.payload as FarmChoicePayloadMap[typeof farmPayment.farmType], {
      costOverride: this.pending.costOverride,
      maxUnits:
        farmPayment.farmType === 'room' && typeof this.pending.actionContext?.maxRooms === 'number'
          ? this.pending.actionContext.maxRooms
          : undefined,
      paymentChoice: value,
      state: this.state,
      space,
    })
    if (!result.ok) {
      return this.respond(false, result.error)
    }

    this.pushHistory()
    this.state.players[playerIndex] = result.player as unknown as PlayerState
    if (farmPayment.farmType === 'room') {
      const farmRooms = (farmPayment.payload as { rooms?: unknown[] }).rooms
      if (Array.isArray(farmRooms)) {
        incRoomsBuilt(this.state.players[playerIndex]!, farmRooms.length)
      }
    }
    return this.continueAfterResolvedFarmChoice(playerIndex)
  }

  commitFarmChoice(
    playerIndex: number,
    farmType: 'fence' | 'room' | 'stable' | 'plow' | 'sow',
    payload: Record<string, unknown>,
  ): SessionResponse {
    if (this.pending.type !== 'choice' || this.pending.playerIndex !== playerIndex) {
      return this.respond(false, 'no pending farm choice for this player')
    }
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')

    const normalized = normalizePlayerFarm(player)
    const lockedKeys = collectLockedFarmTileKeys(player)
    const override = this.pending.type === 'choice' ? this.pending.costOverride : undefined
    let farmChoiceMeta: Record<string, unknown> | undefined
    const requireAtLeastOnePlacement =
      this.activeSpaceId === 'farm-expansion' &&
      (farmType === 'room' || farmType === 'stable')

    switch (farmType) {
      case 'fence': {
        const { edges, palisadeEdges, extraWood } = payload as { edges?: string[]; palisadeEdges?: string[]; extraWood?: number }
        const safeEdges = Array.isArray(edges) ? edges : []
        const safePalisadeEdges = Array.isArray(palisadeEdges) ? palisadeEdges : []
        const pendingFreeFences =
          readPendingFenceBonus(normalized)?.freeFences ?? 0
        // Mirror applyFarmChoice: per-card listeners (E16, C1, C16…) extend the
        // free-fence count via `computeCosts`, so payment preview must use the
        // same total or `resolveTypedFlatPaymentSelection` will reject the
        // payment for cards that bring wood costs to zero.
        const existingEdgeIdsForDiscount = new Set(
          (normalized.fenceSegments ?? []).map((seg) => seg.edge),
        )
        const newFenceEdgesPreview = safeEdges.filter(
          (e) => !existingEdgeIdsForDiscount.has(e),
        )
        const newPalisadeEdgesPreview = safePalisadeEdges.filter(
          (e) => !existingEdgeIdsForDiscount.has(e),
        )
        const space = this.getSpaceById(this.activeSpaceId) ?? undefined
        const fenceOverride = collectComputeCostsForFarmChoice(
          this.state,
          normalized,
          'fence',
          {
            newFenceEdges: newFenceEdgesPreview,
            newPalisadeEdges: newPalisadeEdgesPreview,
          },
          space,
        )
        const hookFreeFences = Math.max(0, Math.abs(fenceOverride.wood ?? 0))
        const freeFences = pendingFreeFences + hookFreeFences
        const adjustedExtraWood = extraWood ?? 0
        const validated = validateFenceSelection(
          normalized,
          safeEdges,
          safePalisadeEdges,
          adjustedExtraWood,
          freeFences,
          {
            skipPayment: true,
            allowPalisades: playerCanBuildPalisades(normalized),
          },
          lockedKeys,
        )
        if (!validated.ok) return this.respond(false, validated.error?.code ?? 'validation failed')

        const payment = resolveTypedFlatPaymentSelection(
          validated.player as unknown as PlayerState,
          { wood: validated.payableWoodCost },
          'pay:fence',
          undefined,
          { type: 'fail', logKey: 'log.fencingFail' },
          'fencing',
        )
        if (payment.type === 'choice') {
          this.pending = {
            type: 'choice',
            playerIndex,
            spaceId: this.activeSpaceId!,
            options: payment.options ?? [],
            promptKey: payment.promptKey,
            sourceCard: this.pending.type === 'choice' ? this.pending.sourceCard : undefined,
            actionContext: {
              ...(this.pending.actionContext ?? {}),
              farmPayment: {
                farmType: 'fence',
                payload: {
                  edges: safeEdges,
                  palisadeEdges: safePalisadeEdges,
                  extraWood: extraWood ?? 0,
                },
              },
            },
          }
          return this.respond()
        }
        if (payment.type === 'fail') {
          return this.respond(false, 'unable to pay fence cost')
        }

        const result = applyFarmChoice(normalized, 'fence', {
          edges: safeEdges,
          palisadeEdges: safePalisadeEdges,
          extraWood: extraWood ?? 0,
        }, {
          state: this.state,
          space,
        })
        if (!result.ok) return this.respond(false, result.error)
        this.pushHistory()
        this.state.players[playerIndex] = result.player as unknown as PlayerState
        farmChoiceMeta = result.meta
        break
      }
      case 'room': {
        const sourceCardForStats = this.pending.type === 'choice' ? this.pending.sourceCard : undefined
        const rooms = Array.isArray((payload as { rooms?: FarmTilePosition[] }).rooms)
          ? (payload as { rooms: FarmTilePosition[] }).rooms
          : []
        if (requireAtLeastOnePlacement && rooms.length === 0) {
          return this.respond(false, 'farm-expansion requires building at least one room')
        }
        const maxUnits =
          typeof this.pending.actionContext?.maxRooms === 'number'
            ? this.pending.actionContext.maxRooms
            : undefined
        const selection = validateRoomSelection(normalized, rooms, lockedKeys)
        if (!selection.ok) return this.respond(false, selection.code)
        const maxBuildableRooms = getMaxBuildableRooms(
          normalized,
          override,
          typeof maxUnits === 'number' ? { maxRooms: maxUnits } : undefined,
        )
        if (rooms.length > maxBuildableRooms) {
          return this.respond(false, 'too many rooms selected')
        }

        const costPerRoom = buildRoomCostPerUnit(
          normalized,
          override,
        )
        const payment = resolveRoomPaymentSelection(
          normalized,
          costPerRoom,
          rooms.length,
        )
        if (payment.type === 'choice') {
          this.pending = {
            type: 'choice',
            playerIndex,
            spaceId: this.activeSpaceId!,
            options: payment.options ?? [],
            promptKey: payment.promptKey,
            costOverride: override,
            sourceCard: this.pending.type === 'choice' ? this.pending.sourceCard : undefined,
            actionContext: {
              ...(this.pending.actionContext ?? {}),
              farmPayment: {
                farmType: 'room',
                payload: { rooms },
              },
            },
          }
          return this.respond()
        }
        if (payment.type === 'fail') {
          return this.respond(false, 'unable to pay room cost')
        }

        const result = applyFarmChoice(normalized, 'room', { rooms }, {
          costOverride: override,
          maxUnits,
        })
        if (!result.ok) return this.respond(false, result.error)
        this.pushHistory()
        this.state.players[playerIndex] = result.player as unknown as PlayerState
        if (sourceCardForStats && rooms.length > 0) {
          // BGA-style gained.room{Wood/Clay/Stone}: when a card causes rooms
          // to be built, count by player's current house material.
          const houseType = this.state.players[playerIndex]!.houseType
          const roomKey =
            houseType === 'wood' ? 'roomWood'
            : houseType === 'clay' ? 'roomClay'
            : 'roomStone'
          addCardResourceGained(this.state.players[playerIndex]!, sourceCardForStats, { [roomKey]: rooms.length })
        }
        incRoomsBuilt(this.state.players[playerIndex]!, rooms.length)
        break
      }
      case 'stable': {
        const sourceCardForStats = this.pending.type === 'choice' ? this.pending.sourceCard : undefined
        const stables = Array.isArray((payload as { stables?: FarmTilePosition[] }).stables)
          ? (payload as { stables: FarmTilePosition[] }).stables
          : []
        if (requireAtLeastOnePlacement && stables.length === 0) {
          return this.respond(false, 'farm-expansion requires building at least one stable')
        }
        const selection = validateStableSelection(normalized, stables, lockedKeys)
        if (!selection.ok) return this.respond(false, selection.code)

        const costPerStable = applyCostOverride(
          { wood: stableWoodCost },
          override,
        )
        const payment = resolveTypedFlatPaymentSelection(
          normalized as unknown as PlayerState,
          scaleCost(costPerStable, stables.length),
          'pay:stable',
          undefined,
          { type: 'fail', logKey: 'log.buildStableFail' },
          'stables',
        )
        if (payment.type === 'choice') {
          this.pending = {
            type: 'choice',
            playerIndex,
            spaceId: this.activeSpaceId!,
            options: payment.options ?? [],
            promptKey: payment.promptKey,
            costOverride: override,
            sourceCard: this.pending.type === 'choice' ? this.pending.sourceCard : undefined,
            actionContext: {
              ...(this.pending.actionContext ?? {}),
              farmPayment: {
                farmType: 'stable',
                payload: { stables },
              },
            },
          }
          return this.respond()
        }
        if (payment.type === 'fail') {
          return this.respond(false, 'unable to pay stable cost')
        }

        const result = applyFarmChoice(normalized, 'stable', { stables }, {
          costOverride: override,
        })
        if (!result.ok) return this.respond(false, result.error)
        this.pushHistory()
        this.state.players[playerIndex] = result.player as unknown as PlayerState
        if (sourceCardForStats && stables.length > 0) {
          addCardResourceGained(this.state.players[playerIndex]!, sourceCardForStats, { stable: stables.length })
        }
        break
      }
      case 'plow': {
        const sourceCardForStats = this.pending.type === 'choice' ? this.pending.sourceCard : undefined
        const tile = (payload as { tile?: FarmTilePosition }).tile
        const selection = validatePlowSelection(normalized, tile, lockedKeys)
        if (!selection.ok) return this.respond(false, selection.error?.code ?? 'validation failed')
        const selectedTile = tile as FarmTilePosition

        const payment = resolveTypedFlatPaymentSelection(
          selection.player as unknown as PlayerState,
          sanitizePayableCost(override),
          'pay:plow',
          undefined,
          { type: 'fail', logKey: 'log.action' },
          'plow',
        )
        if (payment.type === 'choice') {
          this.pending = {
            type: 'choice',
            playerIndex,
            spaceId: this.activeSpaceId!,
            options: payment.options ?? [],
            promptKey: payment.promptKey,
            costOverride: override,
            sourceCard: this.pending.type === 'choice' ? this.pending.sourceCard : undefined,
            actionContext: {
              ...(this.pending.actionContext ?? {}),
              farmPayment: {
                farmType: 'plow',
                payload: { tile: selectedTile },
              },
            },
          }
          return this.respond()
        }
        if (payment.type === 'fail') {
          return this.respond(false, 'unable to pay plow cost')
        }

        const result = applyFarmChoice(normalized, 'plow', { tile: selectedTile }, {
          costOverride: override,
        })
        if (!result.ok) return this.respond(false, result.error)
        this.pushHistory()
        this.state.players[playerIndex] = result.player as unknown as PlayerState
        if (sourceCardForStats) {
          addCardResourceGained(this.state.players[playerIndex]!, sourceCardForStats, { field: 1 })
        }
        break
      }
      case 'sow': {
        const maxSelections = typeof this.pending.actionContext?.maxSelections === 'number'
          ? Math.max(0, Math.floor(this.pending.actionContext.maxSelections))
          : undefined
        const excludedFields = Array.isArray(this.pending.actionContext?.excludedFields)
          ? this.pending.actionContext.excludedFields.filter((field): field is { row: number; col: number } =>
            typeof (field as { row?: unknown }).row === 'number' &&
            typeof (field as { col?: unknown }).col === 'number')
          : undefined
        // Compute extra sowable fields from card effects (e.g. B72 pasture sowing)
        const extraFields = getPermittedExtraSowableFields(player, this.pending.actionContext)
        const extraAllowedCrops = new Map(
          extraFields.map((field) => [positionKey(field.tile), field.allowedCrops] as const),
        )
        const result = applyFarmChoice(normalized, 'sow', payload as FarmChoicePayloadMap['sow'], {
          sowOptions: {
            maxSelections,
            excludedFields,
            extraAllowedCrops: extraAllowedCrops.size > 0 ? extraAllowedCrops : undefined,
          },
        })
        if (!result.ok) return this.respond(false, result.error)
        const nextPlayer = result.player as unknown as PlayerState
        // Handle extra field sowing via card effects
        if (extraAllowedCrops.size > 0) {
          const sowPayload = payload as { crops?: { row: number; col: number; crop: 'grain' | 'vegetable' | 'wood' }[] }
          for (const sel of sowPayload.crops ?? []) {
            const key = positionKey({ row: sel.row, col: sel.col })
            if (extraAllowedCrops.has(key)) {
              const handled = handleSowExtraField(nextPlayer, { row: sel.row, col: sel.col }, sel.crop)
              if (!handled) return this.respond(false, 'invalid extra sow field')
            }
          }
        }
        this.pushHistory()
        this.state.players[playerIndex] = nextPlayer
        break
      }
    }

    return this.continueAfterResolvedFarmChoice(playerIndex, farmChoiceMeta)
  }

  commitSelectionChoice(
    playerIndex: number,
    payload: { positions?: FarmTilePosition[]; cardIds?: string[] },
  ): SessionResponse {
    if (this.pending.type !== 'choice' || this.pending.playerIndex !== playerIndex) {
      return this.respond(false, 'no pending selection choice for this player')
    }
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')

    const selectionKind = (this.pending.actionContext?.selectionKind as string | undefined) ?? 'farm-position'
    const maxSelections = (this.pending.actionContext?.maxSelections as number) ?? 1

    // occupation-hand: validate card IDs
    if (selectionKind === 'occupation-hand') {
      const cardIds = payload.cardIds ?? []
      if (cardIds.length > maxSelections) {
        return this.respond(false, 'too many card selections')
      }
      for (const id of cardIds) {
        if (!player.occupationHand.includes(id)) {
          return this.respond(false, `card ${id} not in occupation hand`)
        }
      }
      this.pushHistory()
      const choiceValue = cardIds.length > 0 ? cardIds.join(',') : 'cancel'
      const space = this.getSpaceById(this.activeSpaceId!) ?? this.createSyntheticSpace('selection')
      this.engine?.resolveChoice(choiceValue, {
        state: this.state,
        player: this.state.players[playerIndex]!,
        space,
      })
      this.flushEngineLog()
      this.runEngineSteps()
      return this.continueAfterResolvedFarmChoice(playerIndex)
    }

    // farm-position (default)
    const positions = payload.positions ?? []
    if (positions.length > maxSelections) {
      return this.respond(false, 'too many selection positions')
    }
    for (const pos of positions) {
      const exists = player.fields.some((f) => f.row === pos.row && f.col === pos.col)
      if (!exists) return this.respond(false, 'invalid field position')
    }

    this.pushHistory()
    const choiceValue =
      positions.length > 0 ? positions.map((p) => `${p.row}-${p.col}`).join(',') : 'cancel'
    const space = this.getSpaceById(this.activeSpaceId!) ?? this.createSyntheticSpace('selection')
    this.engine?.resolveChoice(choiceValue, {
      state: this.state,
      player: this.state.players[playerIndex]!,
      space,
    })
    this.flushEngineLog()
    this.runEngineSteps()
    return this.continueAfterResolvedFarmChoice(playerIndex)
  }

  devSetResources(playerIndex: number, resources: Record<string, number>): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'player not found')
    Object.entries(resources).forEach(([key, value]) => {
      if (typeof value === 'number') {
        (player.resources as Record<string, number>)[key] = value
      }
    })
    return this.respond()
  }

  devSetRound(round: number): SessionResponse {
    this.state.round = round
    return this.respond()
  }

  devSetCurrentPlayer(playerIndex: number): SessionResponse {
    if (playerIndex < 0 || playerIndex >= this.state.players.length) {
      return this.respond(false, 'invalid player index')
    }
    this.state.currentPlayerIndex = playerIndex
    return this.respond()
  }

  private isOccupationCard(cardId: string): boolean {
    // Built-in cards: [A-E]NNN_ pattern, check if it's NOT a minor improvement
    if (cardId.match(/^[A-E]\d+_/)) return !getMinorImprovement(cardId)
    // Custom cards: check session card context
    if (this.sessionCardContext) {
      if (this.sessionCardContext.getCustomOccupation(cardId)) return true
      if (this.sessionCardContext.getCustomMinor(cardId)) return false
    }
    return false
  }

  devDrawCard(playerIndex: number, cardId: string): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'player not found')
    // Remove from all players' hands first
    for (const p of this.state.players) {
      p.minorHand = p.minorHand.filter(id => id !== cardId)
      p.occupationHand = p.occupationHand.filter(id => id !== cardId)
    }
    if (this.isOccupationCard(cardId)) {
      player.occupationHand.push(cardId)
    } else {
      player.minorHand.push(cardId)
    }
    return this.respond()
  }

  devPlayCard(playerIndex: number, cardId: string): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'player not found')
    const isOccupation = this.isOccupationCard(cardId)
    if (isOccupation) {
      player.occupationHand = player.occupationHand.filter((id) => id !== cardId)
      if (!player.occupationPlayed.includes(cardId)) {
        player.occupationPlayed.push(cardId)
      }
    } else {
      player.minorHand = player.minorHand.filter((id) => id !== cardId)
      if (!player.minorPlayed.includes(cardId)) {
        player.minorPlayed.push(cardId)
      }
    }
    getCardModifiers(cardId).forEach((modifier) => {
      if (!player.activeModifiers.some((m) => JSON.stringify(m) === JSON.stringify(modifier))) {
        player.activeModifiers.push(modifier)
      }
    })
    // Trigger onBuy hook (creates PlayerActionCard action spaces, etc.)
    runCardEffectHook(this.state, player, cardId, 'onBuy')
    this.syncDynamicActionSpaces()
    return this.respond()
  }

  devSetSpaceTaken(spaceId: string, playerId: string | null): SessionResponse {
    const space = this.state.actionSpaces.find((s) => s.id === spaceId)
    if (!space) return this.respond(false, 'space not found')
    if (!playerId) {
      space.takenBy = []
    } else {
      const player = this.state.players.find((p) => p.id === playerId)
      const worker = player ? smallestAvailableWorker(this.state, player) : null
      space.takenBy = [{ playerId, workerId: worker?.id ?? '1' }]
    }
    return this.respond()
  }

  devAddRooms(playerIndex: number, rooms: FarmTilePosition[]): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'player not found')
    player.roomTiles = [...player.roomTiles, ...rooms]
    player.rooms = (player.rooms || 0) + rooms.length
    return this.respond()
  }

  undoStep(): SessionResponse {
    const farmPrompt = this.pending.type === 'choice'
      ? this.isFarmPromptKey(this.pending.promptKey)
      : null
    if (this.pending.type === 'choice' && farmPrompt) {
      const currentPromptKey = this.pending.promptKey
      const currentSpaceId = this.pending.spaceId
      const entry = this.history[this.history.length - 1]
      const canRestorePriorChoice =
        !!entry &&
        entry.undoBoundary !== true &&
        entry.activeSpaceId === this.activeSpaceId &&
        entry.activePlayerIndex === this.activePlayerIndex &&
        entry.pending.type === 'choice'
      if (canRestorePriorChoice) {
        this.history.pop()
        this.restoreHistory(entry)
        this.recomputeActionStartIndex()
        return this.respond()
      }
      if (entry && this.engine?.hasPendingChoiceCompositeAncestor()) {
        this.history.pop()
        this.restoreHistory(entry)
        this.recomputeActionStartIndex()
        return this.respond()
      }
      const cancelResult = this.resolvePendingChoice(this.pending.playerIndex, 'cancel', false)
      const stillOnSameFarmPrompt =
        cancelResult.ok &&
        cancelResult.pending.type === 'choice' &&
        cancelResult.pending.promptKey === currentPromptKey &&
        cancelResult.pending.spaceId === currentSpaceId &&
        cancelResult.interaction.stateId === 'farmSelect'
      if (!stillOnSameFarmPrompt) {
        return cancelResult
      }
    }
    // Task 0.6 introduced `state.pendingUndoBoundary` to signal an undo-blocker from a
    // card's handler (e.g. after rolling random). pushHistory consumes the flag and marks
    // the next history entry. But between the roll and the next pushHistory, the flag
    // lives only on state. Honor it directly here so undo cannot cross the roll even in
    // that window.
    if (this.state.pendingUndoBoundary === true) {
      return this.respond(false, 'cannot undo past boundary')
    }
    if (this.history.length > 0 && this.history[this.history.length - 1]?.undoBoundary) {
      return this.respond(false, 'cannot undo past boundary')
    }
    const entry = this.history.pop()
    if (!entry) return this.respond(false, 'no history to undo')
    this.restoreHistory(entry)
    this.recomputeActionStartIndex()
    return this.respond()
  }

  undoAction(): SessionResponse {
    if (this.actionStartIndex === null) return this.respond(false, 'no action snapshot')
    let targetIndex = this.actionStartIndex
    for (let i = this.history.length - 1; i > this.actionStartIndex; i -= 1) {
      if (this.history[i]?.undoBoundary) {
        targetIndex = i
        break
      }
    }
    const entry = this.history[targetIndex]
    if (!entry) return this.respond(false, 'no action snapshot')
    this.restoreHistory(entry)
    this.history = this.history.slice(0, targetIndex)
    if (targetIndex === this.actionStartIndex) {
      this.actionStartIndex = null
    } else {
      this.recomputeActionStartIndex()
    }
    return this.respond()
  }
}
