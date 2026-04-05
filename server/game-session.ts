import type {
  ActionFlow,
  ActionSpace,
  AnytimeAction,
  FarmTilePosition,
  GameState,
  InteractionFarmSelection,
  InteractionState,
  PendingAction,
  PlayerState,
  Resource,
  InteractionAnimalReorgZone,
} from '../shared/game/types.ts'
import { actionDefinitions } from '../shared/actions/index.ts'
import { internalActionDefinitions } from '../shared/actions/internal-actions.ts'
import { clearActionHooks } from '../shared/actions/hooks.ts'
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
} from '../shared/engine/index.ts'
import type { EngineNode } from '../shared/engine/index.ts'
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
} from '../shared/logic/state.ts'
import { clearWorkPhaseBuildingResources } from '../shared/logic/work-phase-resources.ts'
import { getMinorImprovement } from '../shared/game/minor-improvements.ts'
import {
  registerCustomCard,
  getCustomMinorImprovementIds,
  getCustomOccupationIds,
} from '../shared/cards/custom-registry.ts'
import { type CustomCardData, SessionCardContext, withSessionContext } from '../shared/cards/session-card-context.ts'
import { registerExecutorBackedCustomCard } from './custom-code-runtime.ts'
import { getCardModifiers } from '../shared/cards/card-modifiers.ts'
import {
  runRoundEndHooks,
  runBeforeFeedHooks,
  runAfterFeedHooks,
  runBeforeReturnHomeHooks,
  runStartReturnHomeHooks,
  runAfterRoundEndHooks,
  runStartHarvestHooks,
  runStartHarvestFieldPhaseHooks,
  runHarvestFieldPhaseHooks,
  runEndHarvestFieldPhaseHooks,
  runHarvestFeedingPhaseHooks,
  runEndHarvestFeedingPhaseHooks,
  runCardEffectHook,
} from '../shared/cards/card-effects.ts'
import { positionKey } from '../shared/game/farm.ts'
import {
  getMatchingListeners,
  executeCardListener,
  shouldSkipImmediateListenerLog,
} from '../shared/cards/card-listeners.ts'
import { computeScores, type PlayerScoreSummary } from '../shared/logic/scoring.ts'
import { getLooseStableKeys, getPastureCapacity } from '../shared/actions/effects/animals.ts'
import { reap } from '../shared/actions/effects/reap.ts'
import { breedAnimals } from '../shared/actions/effects/breed-animals.ts'
import { recordActionSnapshot } from '../shared/cards/helpers/action-snapshot.ts'
import { recordRoundPlacement, resetRoundPlacements } from '../shared/cards/helpers/round-placement.ts'
import {
  normalizePlayerFarm,
} from './fence-validation.ts'
import { applyFarmChoice } from './farm-choice.ts'
import {
  applyCostOverride,
} from '../shared/actions/effects/pay.ts'
import {
  isMajorImprovementPlayable,
  isMinorImprovementPlayable,
} from '../shared/actions/effects/improvement.ts'
import {
  getOccupationActionCost,
  isOccupationPlayable,
} from '../shared/actions/effects/occupation.ts'
import {
  resolveTypedFlatPaymentSelection,
} from '../shared/actions/effects/pay-helpers.ts'
import {
  buildRoomCostPerUnit,
  getMaxBuildableRooms,
  resolveRoomPaymentSelection,
} from '../shared/actions/effects/room-payment.ts'
import { stableWoodCost } from '../shared/actions/effects/fencing.ts'
import {
  buildFenceFarmInteraction,
  buildPlowFarmInteraction,
  buildRoomFarmInteraction,
  buildSowFarmInteraction,
  buildStableFarmInteraction,
} from './farm-interaction.ts'
import { readPendingFenceBonus } from '../shared/cards/helpers/pending-fence-bonus.ts'
import { rebuildActiveModifiers } from '../shared/game/serialization.ts'
import { validatePlowSelection } from './plow-validation.ts'
import { validateRoomSelection, validateStableSelection } from './validators.ts'
import { validateFenceSelection } from './fence-validation.ts'

type HistoryEntry = {
  state: GameState
  pending: PendingAction
  activeSpaceId: string | null
  activePlayerIndex: number | null
  engineSnapshot: ReturnType<Engine['snapshot']> | null
  engineSource: EngineSource | null
  stageResume: StageResumeState | null
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
    | 'onReturnHome'
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

export class GameSession {
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
  private usedBakeBreadThisAction = false
  private nextActionToken = 1
  private loggedImprovementThisAction = false
  private loggedBakeBreadThisAction = false

  private registry: ActionRegistry
  private hookDispatcher: HookDispatcher
  private engineLog: LogStore
  private sessionCardContext: SessionCardContext | null = null
  readonly cardWarnings: string[] = []

  constructor(stateOrSeed?: GameState | number, customCards?: CustomCardData[], initialStateOptions?: InitialStateOptions) {
    this.registry = new ActionRegistry()
    actionDefinitions.forEach((a) => this.registry.register(a))
    internalActionDefinitions.forEach((a) => this.registry.register(a))
    clearActionHooks()
    this.hookDispatcher = new HookDispatcher()
    this.engineLog = new LogStore()

    // Register custom workshop cards into a per-session context (sandbox mode)
    if (customCards && customCards.length > 0) {
      this.sessionCardContext = new SessionCardContext()
      withSessionContext(this.sessionCardContext, () => {
        for (const cardData of customCards!) {
          try {
            registerCustomCard(cardData)
            registerExecutorBackedCustomCard(cardData)
          } catch (err) {
            const msg = `Failed to register card ${cardData.cardJson.id}: ${err instanceof Error ? err.message : String(err)}`
            console.warn(`[game-session] ${msg}`)
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

  /** Update a player's display name in the game state (called after WS join). */
  updatePlayerName(playerIndex: number, name: string): void {
    const player = this.state.players[playerIndex]
    if (player && name.trim()) {
      player.name = name.trim()
    }
  }

  private buildEngineNode(flow: ActionFlow, counter: { value: number }): EngineNode {
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
      if (def?.resolveChoice) {
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
      if (players[idx] && players[idx].workersAvailable > 0) return idx
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

  private hasHarvestCooking(player: PlayerState) {
    return player.improvements.some((id) =>
      id.startsWith('Major_Fireplace') || id.startsWith('Major_CookingHearth'))
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
      takenBy: null,
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

  private buildRoomInteraction(
    player: PlayerState,
    costOverride?: Partial<Resource>,
    actionContext?: Record<string, unknown>,
  ): InteractionFarmSelection {
    return buildRoomFarmInteraction(player, costOverride, actionContext)
  }

  private buildStableInteraction(player: PlayerState, costOverride?: Partial<Resource>): InteractionFarmSelection {
    return buildStableFarmInteraction(player, costOverride)
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
        return this.buildStableInteraction(player, pending.costOverride)
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
    return anytimeEntries
  }

  private buildAnimalReorgZones(
    player: PlayerState,
  ): InteractionAnimalReorgZone[] {
    return [
      ...player.pastures.map((pasture) => ({
        id: pasture.id,
        zoneType: 'pasture' as const,
        animalType: pasture.animalType,
        animalCount: pasture.animalCount,
        capacity: getPastureCapacity(pasture),
      })),
      {
        id: 'house',
        zoneType: 'house' as const,
        animalType: player.houseAnimalType ?? null,
        animalCount: player.houseAnimalCount ?? 0,
        capacity: 1,
      },
      ...getLooseStableKeys(player).map((key) => ({
        id: `stable:${key}`,
        zoneType: 'stable' as const,
        animalType: player.stableAnimals?.[key] ?? null,
        animalCount: player.stableAnimals?.[key] ? 1 : 0,
        capacity: 1,
      })),
    ]
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
        options: this.pending.options,
        costOverride: this.pending.costOverride,
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
      options: this.pending.options,
      costOverride: this.pending.costOverride,
      allowedCommands: [...allowedCommands],
      anytimeActions,
    }
  }

  private respond(ok = true, error?: string): SessionResponse {
    const resp: SessionResponse = {
      ok,
      state: this.state,
      pending: this.pending,
      interaction: this.buildInteraction(),
      historyLength: this.history.length,
      hasActionStartSnapshot: this.actionStartIndex !== null,
      scores: computeScores(this.state),
      pastureCapacities: this.getPastureCapacities(),
    }
    // Include backend-computed availability for current player
    if (!this.state.gameOver && this.pending.type === 'none') {
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
      actionStart,
      undoBoundary,
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
    snapshot.players.forEach((p) => { p.workersAvailable = p.familySize })
    snapshot.actionSpaces.forEach((space) => { space.takenBy = null })
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
    const effects: {
      buildRoom?: number
      buildStables?: number
      growFamily?: number
      plow?: number
      sowGrain?: number
      sowVegetable?: number
      renovate?: { from: PlayerState['houseType']; to: PlayerState['houseType'] }
      fencing?: number
      improvements?: string[]
      minorImprovements?: string[]
      startPlayer?: boolean
      bakeBread?: { count: number; food: number }
    } = {}
    if (player.rooms > before.rooms) {
      effects.buildRoom = player.rooms - before.rooms
    }
    if (player.familySize > before.familySize) {
      effects.growFamily = player.familySize - before.familySize
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
      if (beforeField && beforeField.crop) return
      if (field.crop === 'grain') sowGrain += 1
      if (field.crop === 'vegetable') sowVegetable += 1
    })
    if (sowGrain > 0) effects.sowGrain = sowGrain
    if (sowVegetable > 0) effects.sowVegetable = sowVegetable
    if (player.houseType !== before.houseType) {
      effects.renovate = { from: before.houseType, to: player.houseType }
    }
    if (player.fences > before.fences) {
      effects.fencing = player.fences - before.fences
    }
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
    return { gains, costs, effects }
  }

  private logActionDetail(before: PlayerState, player: PlayerState) {
    if (!this.activeSpaceId) return
    const space = this.getSpaceById(this.activeSpaceId)
    if (!space) return
    const detailParts = this.buildActionDetailParts(before, player)
    const hasGains = resourceKeyList.some((key) => (detailParts.gains[key] ?? 0) > 0)
    const hasCosts = resourceKeyList.some((key) => (detailParts.costs[key] ?? 0) > 0)
    const hasEffects = Object.keys(detailParts.effects ?? {}).length > 0
    if (detailParts.effects?.improvements || detailParts.effects?.minorImprovements) return
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

  private logImprovementDelta(before: PlayerState, player: PlayerState) {
    if (this.loggedImprovementThisAction) return
    const newImprovements = player.improvements.filter(
      (id) => !before.improvements.includes(id),
    )
    const newMinorImprovements = player.minorPlayed.filter(
      (id) => !before.minorPlayed.includes(id),
    )
    const returnedCards = before.improvements.filter(
      (id) => !player.improvements.includes(id),
    )
    const { costs } = this.buildActionDetailParts(before, player)
    const costResources = Object.fromEntries(
      resourceKeyList
        .filter((key) => (costs[key] ?? 0) > 0)
        .map((key) => [key, costs[key] ?? 0]),
    )
    if (newImprovements.length > 0) {
      this.state.log.unshift({
        key: 'log.playImprovement',
        params: {
          player: player.name,
          improvements: newImprovements.join(','),
          costResources,
          returnedCards: returnedCards.length > 0 ? returnedCards : undefined,
        },
      })
      this.loggedImprovementThisAction = true
    }
    if (newMinorImprovements.length > 0) {
      this.state.log.unshift({
        key: 'log.playMinorImprovement',
        params: {
          player: player.name,
          improvements: newMinorImprovements.join(','),
          costResources,
          returnedCards: returnedCards.length > 0 ? returnedCards : undefined,
        },
      })
      this.loggedImprovementThisAction = true
    }
  }

  private logBakeBreadDelta(before: PlayerState, player: PlayerState) {
    if (this.loggedBakeBreadThisAction) return
    const grainUsed = Math.max(0, before.resources.grain - player.resources.grain)
    const foodGained = Math.max(0, player.resources.food - before.resources.food)
    if (grainUsed > 0 && foodGained > 0) {
      this.state.log.unshift({
        key: 'log.bakeBread',
        params: { player: player.name, count: grainUsed, food: foodGained },
      })
      this.loggedBakeBreadThisAction = true
    }
  }

  private flushEngineLog() {
    const entries = this.engineLog.all()
    if (entries.length > 0) {
      const toAdd = entries.filter((e) => e.key !== 'log.action')
      if (toAdd.some((e) => e.key === 'log.playImprovement' || e.key === 'log.playMinorImprovement')) {
        this.loggedImprovementThisAction = true
      }
      for (let i = toAdd.length - 1; i >= 0; i--) {
        this.state.log.unshift(toAdd[i])
      }
      this.engineLog.clear()
    }
  }

  private finalizeActionLog(player: PlayerState) {
    const before = this.actionStartPlayerSnapshot
    if (before) {
      if (!this.loggedImprovementThisAction && !this.usedBakeBreadThisAction) {
        this.logActionDetail(before, player)
      }
    }
    if (before && !this.loggedImprovementThisAction) {
      this.logImprovementDelta(before, player)
    }
    if (before && !this.loggedBakeBreadThisAction && this.usedBakeBreadThisAction) {
      this.logBakeBreadDelta(before, player)
    }
    this.actionStartPlayerSnapshot = null
    this.usedBakeBreadThisAction = false
    this.loggedImprovementThisAction = false
    this.loggedBakeBreadThisAction = false
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
      const cards = this.getPlayerEffectCardIds(player)
      const startCardIndex = currentPlayerIndex === playerIndex ? cardIndex : 0
      for (let currentCardIndex = startCardIndex; currentCardIndex < cards.length; currentCardIndex += 1) {
        const cardId = cards[currentCardIndex]
        if (!cardId) continue
        const flow = runCardEffectHook(this.state, player, cardId, hook)
        if (!flow) continue
        this.startStageFlow(flow, hook, currentPlayerIndex, currentCardIndex + 1)
        return true
      }
    }
    return false
  }

  private continueHarvestFromBeforeHarvest(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onBeforeHarvest', playerIndex, cardIndex)) {
      return this.respond()
    }
    const harvestOrder = this.getHarvestPlayerIndices()
    harvestOrder.forEach((index) => {
      const player = this.state.players[index]
      if (player) runStartHarvestHooks(this.state, player)
    })

    this.state.phase = 'field'
    this.state.log.unshift({ key: 'log.harvestPhaseReap' })
    harvestOrder.forEach((index) => {
      const player = this.state.players[index]
      if (player) runStartHarvestFieldPhaseHooks(this.state, player)
    })
    harvestOrder.forEach((index) => {
      const player = this.state.players[index]
      if (player) runHarvestFieldPhaseHooks(this.state, player)
    })
    this.state.harvestReapSummary = {}
    harvestOrder.forEach((index) => {
      const player = this.state.players[index]
      if (!player) return
      const result = reap(player)
      this.state.harvestReapSummary![player.id] = result.reapSummary
      this.logHarvestResourceEntry('log.harvestReapDetail', player, result.reapSummary.resources)
    })
    return this.continueAfterReapEffects()
  }

  private continueAfterReapEffects(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onAfterReap', playerIndex, cardIndex)) {
      return this.respond()
    }
    this.getHarvestPlayerIndices().forEach((index) => {
      const player = this.state.players[index]
      if (player) runEndHarvestFieldPhaseHooks(this.state, player)
    })
    delete this.state.harvestReapSummary
    this.state.phase = 'harvest'
    return this.continueHarvestEffects()
  }

  private continueHarvestEffects(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onHarvest', playerIndex, cardIndex)) {
      return this.respond()
    }

    this.state.phase = 'feeding'
    const harvestOrder = this.getHarvestPlayerIndices()
    if (this.continueStageHook('onStartHarvestFeedingPhase')) {
      return this.respond()
    }
    this.state.log.unshift({ key: 'log.harvestPhaseFeed' })
    harvestOrder.forEach((index) => {
      const player = this.state.players[index]
      if (player) runBeforeFeedHooks(this.state, player)
    })
    harvestOrder.forEach((index) => {
      const player = this.state.players[index]
      if (player) runHarvestFeedingPhaseHooks(this.state, player)
    })

    const feedQueue: { index: number; remaining: number; foodUsed: number }[] = []

    for (const i of harvestOrder) {
      const player = this.state.players[i]!
      const newborn = Math.min(player.newbornCount, player.familySize)
      const required = Math.max(0, player.familySize * 2 - newborn)
      const useFood = Math.min(player.resources.food, required)
      player.resources.food -= useFood
      const remaining = required - useFood

      if (remaining <= 0) {
        if (useFood > 0) {
          this.logHarvestResourceEntry('log.harvestFeedDetail', player, { food: useFood })
        }
        continue
      }

      const hasCooking = this.hasHarvestCooking(player)
      const canConvert = player.resources.grain > 0 || player.resources.vegetable > 0 ||
        (hasCooking && (player.resources.sheep > 0 || player.resources.boar > 0 || player.resources.cattle > 0))

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
    this.state.phase = 'work'
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
      case 'onReturnHome':
        this.continueReturnHomeHooks(stageResume.playerIndex, stageResume.cardIndex)
        return
    }
  }

  private runEngineSteps(): void {
    if (!this.engine || this.activePlayerIndex === null || !this.activeSpaceId) return
    const player = this.state.players[this.activePlayerIndex]
    const space = this.getSpaceById(this.activeSpaceId)
    if (!player || !space) return

    while (true) {
      const before = this.clonePlayer(player)
      const step = this.engine!.proceed({ state: this.state, player, space })
      this.flushEngineLog()

      if (step.type === 'blocked' || step.type === 'done') {
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
        this.finalizeActionLog(player)
        const allWorkersUsed = this.state.players.every((p) => p.workersAvailable <= 0)
        if (!allWorkersUsed) {
          const next = this.nextPlayerIdx(this.state.players, this.state.currentPlayerIndex)
          this.pending = { type: 'confirmNextPlayer', nextPlayerIndex: next }
        } else {
          const startIdx = this.state.players.findIndex((p) => p.startPlayer)
          this.pending = { type: 'confirmNextPlayer', nextPlayerIndex: startIdx === -1 ? 0 : startIdx }
        }
        return
      }

      if (step.type === 'playerSwitch') {
        this.pushHistory(false, true)
        const toIndex = this.state.players.findIndex((p) => p.id === step.targetPlayerId)
        if (toIndex !== -1 && toIndex !== this.activePlayerIndex) {
          this.pending = {
            type: 'confirmPlayerSwitch',
            fromPlayerIndex: this.activePlayerIndex!,
            toPlayerIndex: toIndex,
          }
          return
        }
        continue
      }

      if (step.type === 'choice') {
        if (step.choice.options.length === 1) {
          let autoOptions = step.choice.options
          let autoPromptKey = step.choice.promptKey
          while (autoOptions.length === 1) {
            const auto = autoOptions[0]
            const result = this.engine!.resolveChoice(auto.value, { state: this.state, player, space })
            this.flushEngineLog()
            const isBakeChoice =
              autoPromptKey === 'ui.interactionBakeBreadChoice' ||
              autoPromptKey === 'ui.interactionBakeBreadCount'
            if (isBakeChoice && auto.value !== 'cancel' && auto.value !== '__skip__') {
              this.usedBakeBreadThisAction = true
            }
            if (isBakeChoice) {
              this.logBakeBreadDelta(before, player)
            }
            if (result.type === 'choice') {
              if ((result.options?.length ?? 0) === 1) {
                autoOptions = result.options!
                autoPromptKey = result.promptKey
                continue
              }
              this.pending = {
                type: 'choice', playerIndex: this.activePlayerIndex, spaceId: this.activeSpaceId,
                options: result.options ?? [], promptKey: result.promptKey,
                costOverride: this.engine?.getLastComputedCosts(),
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
          costOverride: this.engine?.getLastComputedCosts(),
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
          space.takenBy = null
          player.workersAvailable += 1
        }
        this.engine = null
        this.engineSource = null
        this.pending = { type: 'none' }
        this.actionStartIndex = null
        this.actionStartPlayerSnapshot = null
        this.usedBakeBreadThisAction = false
        return
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

  private canUseOccupiedActionSpace(player: PlayerState, space: ActionSpace): boolean {
    if (!space.takenBy) return false
    return this.hookDispatcher.applyCanUseOccupied(
      { state: this.state, player, space, actionId: space.id },
      false,
    )
  }

  private isActionSpaceAvailableToPlayer(player: PlayerState, space: ActionSpace, roundOpen: Map<string, number>): boolean {
    const openRound = roundOpen.get(space.id) ?? space.roundAvailable
    if (this.state.round < openRound) return false
    if (player.workersAvailable <= 0) return false
    const canUseOccupied = this.canUseOccupiedActionSpace(player, space)
    if (space.takenBy && !canUseOccupied) return false
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

    const occupationCosts: Partial<Resource>[] = []
    if (actionAvailability.lessons === true) {
      occupationCosts.push(getOccupationActionCost(player, 'lessons'))
    }
    if (actionAvailability['lessons-4'] === true) {
      occupationCosts.push(getOccupationActionCost(player, 'lessons-4'))
    }

    const result: Record<string, boolean> = {}

    player.occupationHand.forEach((occupationId) => {
      result[`occupation:${occupationId}`] = occupationCosts.some((cost) =>
        isOccupationPlayable(player, occupationId, cost),
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
      result[player.id] = Object.fromEntries(
        player.pastures.map((pasture) => [pasture.id, getPastureCapacity(pasture)]),
      )
    })
    return result
  }

  takeAction(playerIndex: number, spaceId: string): SessionResponse {
    if (this.state.gameOver) return this.respond(false, 'game is over')
    if (this.pending.type !== 'none') return this.respond(false, 'interaction in progress')
    if (playerIndex !== this.state.currentPlayerIndex) return this.respond(false, 'not your turn')
    const player = this.state.players[playerIndex]
    if (!player || player.workersAvailable <= 0) return this.respond(false, 'no workers available')
    const space = this.state.actionSpaces.find((s) => s.id === spaceId)
    if (!space) return this.respond(false, 'space unavailable')
    const canUseOccupied = this.canUseOccupiedActionSpace(player, space)
    if (space.takenBy && !canUseOccupied) return this.respond(false, 'space unavailable')

    this.pushHistory(true)
    this.actionStartPlayerSnapshot = this.clonePlayer(player)
    this.usedBakeBreadThisAction = false
    recordActionSnapshot(player, this.nextActionToken++)
    if (!space.takenBy) {
      space.takenBy = player.id
    }
    player.workersAvailable -= 1
    recordRoundPlacement(player, spaceId)
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

    const promptKey = pending.promptKey
    if (pushHistoryEntry) {
      this.pushHistory()
    }
    const before = this.clonePlayer(player)
    const isBakeChoice =
      promptKey === 'ui.interactionBakeBreadChoice' ||
      promptKey === 'ui.interactionBakeBreadCount'
    if (isBakeChoice && value !== 'cancel' && value !== '__skip__') {
      this.usedBakeBreadThisAction = true
    }
    const result = this.engine.resolveChoice(value, { state: this.state, player, space })
    this.flushEngineLog()
    if (isBakeChoice) {
      this.logBakeBreadDelta(before, player)
    }
    if (result.type === 'choice') {
      this.pending = {
        type: 'choice', playerIndex, spaceId: this.activeSpaceId!,
        options: result.options ?? [], promptKey: result.promptKey,
        costOverride: this.engine.getLastComputedCosts(),
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
      this.usedBakeBreadThisAction = false
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

    const pastureZones = zones.filter((z) => z.zoneType === 'pasture')
    player.pastures = player.pastures.map((pasture) => {
      const assigned = pastureZones.find((z) => z.id === pasture.id)
      if (!assigned || !assigned.animalType) return { ...pasture, animalType: null, animalCount: 0 }
      const capacity = getPastureCapacity(pasture)
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
    } else {
      this.finalizeActionLog(player)
      const allWorkersUsed = this.state.players.every((p) => p.workersAvailable <= 0)
      if (!allWorkersUsed) {
        const next = this.nextPlayerIdx(this.state.players, this.state.currentPlayerIndex)
        this.pending = { type: 'confirmNextPlayer', nextPlayerIndex: next }
      }
    }
    return this.respond()
  }

  confirmHarvestFeed(playerIndex: number, selections: { resourceKey: keyof Resource; count: number; food: number; sourceName?: string }[]): SessionResponse {
    if (this.pending.type !== 'harvestFeed' || this.pending.playerIndex !== playerIndex) {
      return this.respond(false, 'no pending feed')
    }
    this.pushHistory()
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')

    let totalFood = 0
    const usedResources: Partial<Resource> = { food: this.pending.foodUsed }
    for (const sel of selections) {
      if (sel.count <= 0) continue
      const available = player.resources[sel.resourceKey]
      const used = Math.min(sel.count, available)
      player.resources[sel.resourceKey] -= used
      totalFood += used * sel.food
      usedResources[sel.resourceKey] = (usedResources[sel.resourceKey] ?? 0) + used
      this.state.log.unshift({
        key: 'log.harvestFeedConvert',
        params: {
          player: player.name,
          source: sel.sourceName ?? 'Harvest conversion',
          cost: { [sel.resourceKey]: used },
          food: { food: used * sel.food },
        },
      })
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

    // Check if all workers are used (round end condition)
    const allWorkersUsed = this.state.players.every((p) => p.workersAvailable <= 0)
    if (allWorkersUsed) {
      return this.performRoundEnd()
    }

    return this.respond()
  }

  performRoundEnd(): SessionResponse {
    const allUsed = this.state.players.every((p) => p.workersAvailable <= 0)
    if (!allUsed) return this.respond(false, 'not all workers used')
    if (this.pending.type !== 'none') return this.respond(false, 'pending action exists')

    const pendingAnimal = this.state.players.findIndex((p) => this.hasPendingAnimals(p))
    if (pendingAnimal !== -1) {
      this.pending = { type: 'animalReorg', playerIndex: pendingAnimal, spaceId: 'round-end' }
      return this.respond()
    }

    this.pushHistory()
    this.state.phase = 'returning-home'
    this.state.players.forEach((p) => runBeforeReturnHomeHooks(this.state, p))
    this.state.players.forEach((p) => runStartReturnHomeHooks(this.state, p))
    return this.continueReturnHomeHooks()
  }

  private continueReturnHomeHooks(playerIndex = 0, cardIndex = 0): SessionResponse {
    if (this.continueStageHook('onReturnHome', playerIndex, cardIndex)) {
      return this.respond()
    }
    this.state.players.forEach((p) => clearWorkPhaseBuildingResources(this.state, p.id))
    this.state.players.forEach((p) => { p.workersAvailable = p.familySize })
    this.state.actionSpaces.forEach((s) => { s.takenBy = null })

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
    this.state.phase = 'harvest'
    this.state.log.unshift({ key: 'log.harvest', params: { round: this.state.round } })
    return this.continueHarvestFromBeforeHarvest()
  }

  private startBreedPhase(): SessionResponse {
    this.state.phase = 'breeding'
    const harvestOrder = this.getHarvestPlayerIndices()
    harvestOrder.forEach((index) => {
      const player = this.state.players[index]
      if (player) runEndHarvestFeedingPhaseHooks(this.state, player)
    })
    harvestOrder.forEach((index) => {
      const player = this.state.players[index]
      if (player) runAfterFeedHooks(this.state, player)
    })
    this.state.log.unshift({ key: 'log.harvestPhaseBreed' })
    this.applyBreedPhase()
    
    const pendingAnimal = harvestOrder.find((index) => {
      const player = this.state.players[index]
      return !!player && this.hasPendingAnimals(player)
    }) ?? -1
    if (pendingAnimal !== -1) {
      this.pending = { type: 'animalReorg', playerIndex: pendingAnimal, spaceId: 'harvest-breed' }
      return this.respond()
    }

    return this.continueEndHarvestEffects()
  }

  private applyBreedPhase() {
    this.state.harvestBreedSummary = {}
    this.getHarvestPlayerIndices().forEach((index) => {
      const p = this.state.players[index]
      if (!p) return
      const result = breedAnimals(p)
      this.state.harvestBreedSummary![p.id] = result.breedSummary
      this.logHarvestResourceEntry('log.harvestBreedDetail', p, result.breedSummary.resources)
    })
  }

  private finalizeRound(): SessionResponse {
    this.state.phase = 'preparation'
    this.state.players.forEach((p) => runRoundEndHooks(this.state, p))
    this.state.players.forEach((p) => runAfterRoundEndHooks(this.state, p))
    this.state.players.forEach((p) => { p.newbornCount = 0 })
    this.state.round += 1
    if (this.state.round > 14) {
      this.state.gameOver = true
      this.state.log.unshift({ key: 'log.gameOver' })
      this.pending = { type: 'none' }
      return this.respond()
    }
    return this.continueBeforeStartOfTurn()
  }

  loadState(raw: unknown): SessionResponse {
    this.state = rebuildActiveModifiers(normalizeState(raw as GameState))
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
        costOverride: this.engine.getLastComputedCosts(),
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
    const result = applyFarmChoice(normalized, farmPayment.farmType, farmPayment.payload as any, {
      costOverride: this.pending.costOverride,
      maxUnits:
        farmPayment.farmType === 'room' && typeof this.pending.actionContext?.maxRooms === 'number'
          ? this.pending.actionContext.maxRooms
          : undefined,
      paymentChoice: value,
    })
    if (!result.ok) {
      return this.respond(false, result.error)
    }

    this.pushHistory()
    this.state.players[playerIndex] = result.player as unknown as PlayerState
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
    const override = this.pending.type === 'choice' ? this.pending.costOverride : undefined
    let farmChoiceMeta: Record<string, unknown> | undefined
    const requireAtLeastOnePlacement =
      this.activeSpaceId === 'farm-expansion' &&
      (farmType === 'room' || farmType === 'stable')

    switch (farmType) {
      case 'fence': {
        const { edges, extraWood } = payload as { edges?: string[]; extraWood?: number }
        const safeEdges = Array.isArray(edges) ? edges : []
        const freeFences =
          readPendingFenceBonus(normalized)?.freeFences ?? 0
        const woodDiscount = Math.max(0, Math.abs(override?.wood ?? 0))
        const adjustedExtraWood = Math.max(0, (extraWood ?? 0) - woodDiscount)
        const validated = validateFenceSelection(
          normalized,
          safeEdges,
          adjustedExtraWood,
          freeFences,
          { skipPayment: true },
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
            costOverride: override,
            actionContext: {
              ...(this.pending.actionContext ?? {}),
              farmPayment: {
                farmType: 'fence',
                payload: { edges: safeEdges, extraWood: extraWood ?? 0 },
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
          extraWood: extraWood ?? 0,
        }, {
          costOverride: override,
        })
        if (!result.ok) return this.respond(false, result.error)
        this.pushHistory()
        this.state.players[playerIndex] = result.player as unknown as PlayerState
        farmChoiceMeta = result.meta
        break
      }
      case 'room': {
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
        const selection = validateRoomSelection(normalized, rooms)
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
        break
      }
      case 'stable': {
        const stables = Array.isArray((payload as { stables?: FarmTilePosition[] }).stables)
          ? (payload as { stables: FarmTilePosition[] }).stables
          : []
        if (requireAtLeastOnePlacement && stables.length === 0) {
          return this.respond(false, 'farm-expansion requires building at least one stable')
        }
        const selection = validateStableSelection(normalized, stables)
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
        break
      }
      case 'plow': {
        const tile = (payload as { tile?: FarmTilePosition }).tile
        const selection = validatePlowSelection(normalized, tile)
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
        const result = applyFarmChoice(normalized, 'sow', payload as any, {
          sowOptions: {
            maxSelections,
            excludedFields,
          },
        })
        if (!result.ok) return this.respond(false, result.error)
        this.pushHistory()
        this.state.players[playerIndex] = result.player as unknown as PlayerState
        break
      }
    }

    return this.continueAfterResolvedFarmChoice(playerIndex, farmChoiceMeta)
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

  devPlayCard(playerIndex: number, cardId: string): SessionResponse {
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'player not found')
    const isOccupation = cardId.match(/^[A-E]\d+_/) && !getMinorImprovement(cardId)
    if (isOccupation) {
      if (!player.occupationPlayed.includes(cardId)) {
        player.occupationPlayed.push(cardId)
      }
    } else {
      if (!player.minorPlayed.includes(cardId)) {
        player.minorPlayed.push(cardId)
      }
    }
    player.playedCards = player.playedCards ?? []
    const prefix = isOccupation ? 'occupation' : 'minor'
    const playedKey = `${prefix}:${cardId}`
    if (!player.playedCards.includes(playedKey)) {
      player.playedCards.push(playedKey)
    }
    getCardModifiers(cardId).forEach((modifier) => {
      if (!player.activeModifiers.some((m) => JSON.stringify(m) === JSON.stringify(modifier))) {
        player.activeModifiers.push(modifier)
      }
    })
    return this.respond()
  }

  devSetSpaceTaken(spaceId: string, playerId: string | null): SessionResponse {
    const space = this.state.actionSpaces.find((s) => s.id === spaceId)
    if (!space) return this.respond(false, 'space not found')
    space.takenBy = playerId
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
