import type {
  ActionFlow,
  AnytimeAction,
  FarmTilePosition,
  GameState,
  InteractionFarmSelection,
  InteractionState,
  PendingAction,
  PlayerState,
  Resource,
} from '../shared/game/types.ts'
import { actionDefinitions } from '../shared/actions/index.ts'
import { internalActionDefinitions } from '../shared/actions/internal-actions.ts'
import { clearActionHooks, applyIsDoableHooks } from '../shared/actions/hooks.ts'
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
  normalizeState,
  resourceKeyList,
  applyRoundGrowth,
  applyFutureMeeples,
} from '../shared/logic/state.ts'
import { applyMajorEffectsToAllPlayers } from '../shared/cards/major/index.ts'
import { getMinorImprovement } from '../shared/game/minor-improvements.ts'
import { getCardModifier } from '../shared/cards/card-modifiers.ts'
import { getBuildRoomCost } from '../shared/actions/effects/house.ts'
import { applyCostOverride } from '../shared/actions/effects/pay.ts'
import { stableWoodCost } from '../shared/actions/effects/fencing.ts'
import { runReturnHomeHooks, runRoundEndHooks, runBeforeHarvestHooks, runAfterReapHooks, runBeforeFeedHooks, runAfterFeedHooks, runAfterHarvestHooks, runBeforeStartOfTurnHooks, runBeforeReturnHomeHooks, runStartReturnHomeHooks, runAfterRoundEndHooks, runStartHarvestHooks, runStartHarvestFieldPhaseHooks, runHarvestFieldPhaseHooks, runEndHarvestFieldPhaseHooks, runStartHarvestFeedingPhaseHooks, runHarvestFeedingPhaseHooks, runEndHarvestFeedingPhaseHooks, runEndHarvestHooks } from '../shared/cards/card-effects.ts'
import { positionKey } from '../shared/game/farm.ts'
import { getMatchingListeners, executeCardListener } from '../shared/cards/card-listeners.ts'
import { computeScores, type PlayerScoreSummary } from '../shared/logic/scoring.ts'
import { getPastureCapacity } from '../shared/actions/effects/animals.ts'
import { reap } from '../shared/actions/effects/reap.ts'
import { breedAnimals } from '../shared/actions/effects/breed-animals.ts'
import {
  getAllEdgeIds,
  getAllTilePositions,
  normalizePlayerFarm,
  validateFenceSelection,
} from './fence-validation.ts'
import { validateRoomSelection, validateStableSelection } from './validators.ts'
import { validatePlowSelection } from './plow-validation.ts'
import { validateSowSelection, type SowSelection } from './sow-validation.ts'

type HistoryEntry = {
  state: GameState
  pending: PendingAction
  activeSpaceId: string | null
  activePlayerIndex: number | null
  engineSnapshot: ReturnType<Engine['snapshot']> | null
  actionStart: boolean
  undoBoundary?: boolean
}

export type SessionResponse = {
  ok: boolean
  state: GameState
  pending: PendingAction
  interaction: InteractionState
  historyLength: number
  hasActionStartSnapshot: boolean
  scores?: PlayerScoreSummary[]
  actionAvailability?: Record<string, boolean>
  error?: string
}

export class GameSession {
  private state: GameState
  private engine: Engine | null = null
  private activeSpaceId: string | null = null
  private activePlayerIndex: number | null = null
  private pending: PendingAction = { type: 'none' }
  private history: HistoryEntry[] = []
  private actionStartIndex: number | null = null
  private actionStartPlayerSnapshot: PlayerState | null = null
  private usedBakeBreadThisAction = false
  private loggedImprovementThisAction = false
  private loggedBakeBreadThisAction = false

  private registry: ActionRegistry
  private hookDispatcher: HookDispatcher
  private engineLog: LogStore

  constructor(stateOrSeed?: GameState | number) {
    this.registry = new ActionRegistry()
    actionDefinitions.forEach((a) => this.registry.register(a))
    internalActionDefinitions.forEach((a) => this.registry.register(a))
    clearActionHooks()
    this.hookDispatcher = new HookDispatcher()
    this.engineLog = new LogStore()

    if (stateOrSeed && typeof stateOrSeed === 'object') {
      this.state = normalizeState(stateOrSeed)
    } else {
      const seed = typeof stateOrSeed === 'number' ? stateOrSeed : undefined
      this.state = createInitialState(seed)
    }
  }

  private createEngine(actionId: string): Engine {
    const action = this.registry.get(actionId)
    let counter = 0
    const build = (flow: ActionFlow): EngineNode => {
      if (flow.type === 'leaf') {
        const an = new ActionNode(`action-${flow.actionId}-${counter++}`, flow.actionId)
        const def = this.registry.get(flow.actionId)
        if (def?.resolveChoice) {
          const seq = new SequenceNode(`seq-${flow.actionId}-${counter++}`, [
            an, new ChoiceNode(`choice-${flow.actionId}-${counter++}`, []),
          ])
          return flow.optional ? new OptionalNode(`opt-${counter++}`, seq, flow.promptKey) : seq
        }
        return flow.optional ? new OptionalNode(`opt-${counter++}`, an, flow.promptKey) : an
      }
      const children = flow.children.map((c) => build(c))
      if (flow.type === 'seq') {
        const s = new SequenceNode(`seq-${counter++}`, children)
        return flow.optional ? new OptionalNode(`opt-${counter++}`, s, flow.promptKey) : s
      }
      if (flow.type === 'parallel') {
        const p = new ParallelNode(`par-${counter++}`, children)
        return flow.optional ? new OptionalNode(`opt-${counter++}`, p, flow.promptKey) : p
      }
      if (flow.type === 'xor') {
        const x = new XorNode(`xor-${counter++}`, children, flow.promptKey)
        return flow.optional ? new OptionalNode(`opt-${counter++}`, x, flow.promptKey) : x
      }
      const o = new OrNode(`or-${counter++}`, children, flow.promptKey)
      return flow.optional ? new OptionalNode(`opt-${counter++}`, o, flow.promptKey) : o
    }
    const an = new ActionNode(`action-${actionId}`, actionId)
    const root = action?.flow
      ? build(action.flow)
      : action?.resolveChoice
        ? new SequenceNode(`seq-${actionId}`, [an, new ChoiceNode(`choice-${actionId}`, [])])
        : an
    return new Engine({ tree: new EngineTree(root), registry: this.registry, hooks: this.hookDispatcher, log: this.engineLog })
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

  private getActiveInteractionContext() {
    if (this.activePlayerIndex === null || !this.activeSpaceId) return null
    const player = this.state.players[this.activePlayerIndex]
    const space = this.state.actionSpaces.find((item) => item.id === this.activeSpaceId)
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

  private buildRoomInteraction(player: PlayerState, costOverride?: Partial<Resource>): InteractionFarmSelection {
    const normalized = normalizePlayerFarm(player as Parameters<typeof normalizePlayerFarm>[0])
    const occupied = new Set(normalized.roomTiles.map(positionKey))
    normalized.fields.forEach((field) => occupied.add(positionKey(field)))
    normalized.stableTiles.forEach((tile) => occupied.add(positionKey(tile)))
    normalized.pastures.flatMap((pasture) => pasture.tiles).forEach((tile) => occupied.add(positionKey(tile)))
    const selectableTiles = getAllTilePositions().filter((tile) => !occupied.has(positionKey(tile)))
    const costPerRoom = applyCostOverride(getBuildRoomCost(player.houseType), costOverride)
    const resourceMax = Object.entries(costPerRoom).reduce((max, [key, value]) => {
      if (typeof value !== 'number' || value <= 0) return max
      const available = player.resources[key as keyof Resource] ?? 0
      return Math.min(max, Math.floor(available / value))
    }, Number.POSITIVE_INFINITY)
    const maxSelections = Math.min(
      selectableTiles.length,
      Number.isFinite(resourceMax) ? resourceMax : selectableTiles.length,
    )
    return {
      farmType: 'room',
      selectableTiles,
      maxSelections: Math.max(0, maxSelections),
      costPerRoom,
    }
  }

  private buildStableInteraction(player: PlayerState, costOverride?: Partial<Resource>): InteractionFarmSelection {
    const normalized = normalizePlayerFarm(player as Parameters<typeof normalizePlayerFarm>[0])
    const occupied = new Set(normalized.roomTiles.map(positionKey))
    normalized.fields.forEach((field) => occupied.add(positionKey(field)))
    normalized.stableTiles.forEach((tile) => occupied.add(positionKey(tile)))
    const selectableTiles = getAllTilePositions().filter((tile) => !occupied.has(positionKey(tile)))
    const woodDiscount = Math.max(0, Math.abs(costOverride?.wood ?? 0))
    const effectiveCost = Math.max(0, stableWoodCost - woodDiscount)
    const woodAvailable = player.resources.wood ?? 0
    const maxSelections =
      effectiveCost === 0
        ? Math.max(0, 4 - normalized.stableTiles.length)
        : Math.min(
            Math.max(0, 4 - normalized.stableTiles.length),
            Math.floor(woodAvailable / effectiveCost),
          )
    return {
      farmType: 'stable',
      selectableTiles,
      maxSelections,
    }
  }

  private buildPlowInteraction(player: PlayerState): InteractionFarmSelection {
    const normalized = normalizePlayerFarm(player as Parameters<typeof normalizePlayerFarm>[0])
    const selectableTiles = getAllTilePositions().filter(
      (tile) => validatePlowSelection(normalized, tile).ok,
    )
    return { farmType: 'plow', selectableTiles }
  }

  private buildSowInteraction(player: PlayerState): InteractionFarmSelection {
    const normalized = normalizePlayerFarm(player as Parameters<typeof normalizePlayerFarm>[0])
    const selectableFields = normalized.fields.flatMap((field) => {
      if (field.crop !== null) return []
      const allowedCrops: ('grain' | 'vegetable')[] = []
      if ((normalized.resources.grain ?? 0) > 0) {
        allowedCrops.push('grain')
      }
      if ((normalized.resources.vegetable ?? 0) > 0) {
        allowedCrops.push('vegetable')
      }
      if (allowedCrops.length === 0) return []
      return [{ tile: { row: field.row, col: field.col }, allowedCrops }]
    })
    return { farmType: 'sow', selectableFields }
  }

  private buildFenceInteraction(pending: Extract<PendingAction, { type: 'choice' }>): InteractionFarmSelection {
    const normalized = normalizePlayerFarm(this.state.players[pending.playerIndex] as Parameters<typeof normalizePlayerFarm>[0])
    const existing = new Set(normalized.fenceSegments ?? [])
    const selectableEdges = getAllEdgeIds().filter((edgeId) => !existing.has(edgeId))
    const extraWood = pending.spaceId === 'farm-redevelopment' ? 1 : 0
    return {
      farmType: 'fence',
      selectableEdges,
      extraWood,
    }
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
        return this.buildRoomInteraction(player, pending.costOverride)
      case 'stable':
        return this.buildStableInteraction(player, pending.costOverride)
      case 'plow':
        return this.buildPlowInteraction(player)
      case 'sow':
        return this.buildSowInteraction(player)
      default:
        return null
    }
  }

  private buildAnytimeEntries(): { descriptor: AnytimeAction; flow: ActionFlow }[] {
    const context = this.getActiveInteractionContext()
    if (!context) return []
    if (this.pending.type === 'animalReorg' || this.pending.type === 'harvestFeed') {
      return []
    }
    // Suppress anytime actions during sub-choice resolution (e.g. bake-bread)
    // to avoid recursive anytime interrupts
    if (
      this.pending.type === 'choice' &&
      this.pending.promptKey &&
      this.pending.promptKey.startsWith('ui.interactionBakeBread')
    ) {
      return []
    }
    const { player, space } = context
    const anytimeEntries: { descriptor: AnytimeAction; flow: ActionFlow }[] = []
    // Auto-discover anytime actions from registry instead of hardcoding
    for (const action of this.registry.values()) {
      if (!action.anytime) continue
      const doable = applyIsDoableHooks(
        { state: this.state, player, space, actionId: action.id },
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

  private buildInteraction(): InteractionState {
    // Fast paths: skip expensive anytime/farm computation for states that don't need them
    if (this.pending.type === 'animalReorg') {
      return {
        stateId: 'animalReorg',
        playerIndex: this.pending.playerIndex,
        spaceId: this.pending.spaceId,
        allowedCommands: ['confirmReorg', 'undoStep', 'undoAction'],
        anytimeActions: [],
      }
    }
    if (this.pending.type === 'harvestFeed') {
      return {
        stateId: 'harvestFeed',
        playerIndex: this.pending.playerIndex,
        remaining: this.pending.remaining,
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
    }
    if (this.state.gameOver) {
      resp.scores = computeScores(this.state)
    }
    // Include action availability for current player
    if (!this.state.gameOver && this.pending.type === 'none') {
      resp.actionAvailability = this.getActionAvailability(this.state.currentPlayerIndex)
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
    if (entry.engineSnapshot && entry.activeSpaceId) {
      this.engine = this.createEngine(entry.activeSpaceId)
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
    const space = this.state.actionSpaces.find((s) => s.id === this.activeSpaceId)
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
    const { costs } = this.buildActionDetailParts(before, player)
    if (newImprovements.length > 0) {
      this.state.log.unshift({
        key: 'log.playImprovement',
        params: { player: player.name, improvements: newImprovements.join(','), costResources: costs },
      })
      this.loggedImprovementThisAction = true
    }
    if (newMinorImprovements.length > 0) {
      this.state.log.unshift({
        key: 'log.playMinorImprovement',
        params: { player: player.name, improvements: newMinorImprovements.join(','), costResources: costs },
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

  private runEngineSteps(): void {
    if (!this.engine || this.activePlayerIndex === null || !this.activeSpaceId) return
    const player = this.state.players[this.activePlayerIndex]
    const space = this.state.actionSpaces.find((s) => s.id === this.activeSpaceId)
    if (!player || !space) return

    while (true) {
      const before = this.clonePlayer(player)
      const step = this.engine.proceed({ state: this.state, player, space })
      this.flushEngineLog()

      if (step.type === 'blocked' || step.type === 'done') {
        this.engine = null
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
            const result = this.engine.resolveChoice(auto.value, { state: this.state, player, space })
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
              }
              return
            }
            if (result.type === 'fail') {
              this.pending = { type: 'none' }
              this.engine = null
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
        space.takenBy = null
        player.workersAvailable += 1
        this.engine = null
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

  getAvailableActions(playerIndex: number): { spaceId: string; nameKey: string }[] {
    const player = this.state.players[playerIndex]
    if (!player) return []
    const roundOpen = createRoundOpenById(this.state.roundActionOrder)
    return this.state.actionSpaces
      .filter((space) => {
        if (space.takenBy) return false
        const openRound = roundOpen.get(space.id) ?? space.roundAvailable
        if (this.state.round < openRound) return false
        if (player.workersAvailable <= 0) return false
        return applyIsDoableHooks(
          { state: this.state, player, space, actionId: space.id },
          space.canBeExecutedByPlayer(this.state, player),
        )
      })
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
      // Basic availability checks (same as getAvailableActions)
      if (space.takenBy) {
        result[space.id] = false
        continue
      }
      const openRound = roundOpen.get(space.id) ?? space.roundAvailable
      if (this.state.round < openRound) {
        result[space.id] = false
        continue
      }
      if (player.workersAvailable <= 0) {
        result[space.id] = false
        continue
      }
      // Backend-executability check
      result[space.id] = applyIsDoableHooks(
        { state: this.state, player, space, actionId: space.id },
        space.canBeExecutedByPlayer(this.state, player),
      )
    }

    return result
  }

  takeAction(playerIndex: number, spaceId: string): SessionResponse {
    if (this.state.gameOver) return this.respond(false, 'game is over')
    if (this.pending.type !== 'none') return this.respond(false, 'interaction in progress')
    if (playerIndex !== this.state.currentPlayerIndex) return this.respond(false, 'not your turn')
    const player = this.state.players[playerIndex]
    if (!player || player.workersAvailable <= 0) return this.respond(false, 'no workers available')
    const space = this.state.actionSpaces.find((s) => s.id === spaceId)
    if (!space || space.takenBy) return this.respond(false, 'space unavailable')

    this.pushHistory(true)
    this.actionStartPlayerSnapshot = this.clonePlayer(player)
    this.usedBakeBreadThisAction = false
    space.takenBy = player.id
    player.workersAvailable -= 1
    this.state.log.unshift({ key: 'log.placeFarmer', params: { player: player.name, action: space.nameKey } })

    this.engine = this.createEngine(spaceId)
    this.activeSpaceId = spaceId
    this.activePlayerIndex = playerIndex

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
      const result = executeCardListener(entry.registration, beforeListenerContext)
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

  resolveChoice(playerIndex: number, value: string): SessionResponse {
    const pending = this.pending
    if (pending.type !== 'choice' || pending.playerIndex !== playerIndex) {
      return this.respond(false, 'no pending choice for this player')
    }
    if (!this.engine) {
      if (pending.promptKey === 'ui.interactionFenceSelect') {
        this.pending = { type: 'none' }
        return this.respond()
      }
      return this.respond(false, 'no active engine')
    }
    const player = this.state.players[playerIndex]
    const space = this.state.actionSpaces.find((s) => s.id === this.activeSpaceId)
    if (!player || !space) return this.respond(false, 'invalid state')

    const promptKey = pending.promptKey
    this.pushHistory()
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
      this.actionStartIndex = null
      this.actionStartPlayerSnapshot = null
      this.usedBakeBreadThisAction = false
      return this.respond()
    }
    this.runEngineSteps()
    return this.respond()
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
    if (source === 'harvest-breed') {
      const nextPending = this.state.players.findIndex((p) => this.hasPendingAnimals(p))
      if (nextPending !== -1) {
        this.pending = { type: 'animalReorg', playerIndex: nextPending, spaceId: 'harvest-breed' }
        return this.respond()
      }
      this.state.players.forEach((p) => runEndHarvestHooks(this.state, p))
      this.state.players.forEach((p) => runAfterHarvestHooks(this.state, p))
      return this.finalizeRound()
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

  confirmHarvestFeed(playerIndex: number, selections: { resourceKey: keyof Resource; count: number; food: number }[]): SessionResponse {
    if (this.pending.type !== 'harvestFeed' || this.pending.playerIndex !== playerIndex) {
      return this.respond(false, 'no pending feed')
    }
    this.pushHistory()
    const player = this.state.players[playerIndex]
    if (!player) return this.respond(false, 'invalid player')

    let totalFood = 0
    for (const sel of selections) {
      if (sel.count <= 0) continue
      const available = player.resources[sel.resourceKey]
      const used = Math.min(sel.count, available)
      player.resources[sel.resourceKey] -= used
      totalFood += used * sel.food
    }
    const required = this.pending.remaining
    const deficit = Math.max(0, required - totalFood)
    if (deficit > 0) {
      player.resources.begging += deficit
    }

    const feedQueue = this.pending.feedQueue ?? []
    if (feedQueue.length > 0) {
      const next = feedQueue[0]!
      this.pending = { 
        type: 'harvestFeed', 
        playerIndex: next.index, 
        remaining: next.remaining,
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
    this.activeSpaceId = null
    this.activePlayerIndex = null
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
    this.applyReturnHome()
    if (harvestRounds.includes(this.state.round)) {
      return this.startHarvest()
    }
    return this.finalizeRound()
  }

  private applyReturnHome() {
    this.state.players.forEach((p) => runBeforeReturnHomeHooks(this.state, p))
    this.state.players.forEach((p) => runStartReturnHomeHooks(this.state, p))
    this.state.players.forEach((p) => runReturnHomeHooks(this.state, p))
    this.state.players.forEach((p) => { p.workersAvailable = p.familySize })
    this.state.actionSpaces.forEach((s) => { s.takenBy = null })
  }

  private startHarvest(): SessionResponse {
    this.state.players.forEach((p) => runBeforeHarvestHooks(this.state, p))
    this.state.players.forEach((p) => runStartHarvestHooks(this.state, p))

    this.state.players.forEach((p) => runStartHarvestFieldPhaseHooks(this.state, p))
    this.state.players.forEach((p) => runHarvestFieldPhaseHooks(this.state, p))
    this.state.players.forEach((p) => reap(p))
    this.state.players.forEach((p) => runAfterReapHooks(this.state, p))
    this.state.players.forEach((p) => runEndHarvestFieldPhaseHooks(this.state, p))

    applyMajorEffectsToAllPlayers(this.state, 'onHarvest')

    this.state.players.forEach((p) => runStartHarvestFeedingPhaseHooks(this.state, p))
    this.state.players.forEach((p) => runBeforeFeedHooks(this.state, p))
    this.state.players.forEach((p) => runHarvestFeedingPhaseHooks(this.state, p))

    const feedQueue: { index: number; remaining: number }[] = []
    
    for (let i = 0; i < this.state.players.length; i++) {
      const p = this.state.players[i]!
      const newborn = Math.min(p.newbornCount, p.familySize)
      const required = Math.max(0, p.familySize * 2 - newborn)
      const useFood = Math.min(p.resources.food, required)
      p.resources.food -= useFood
      const remaining = required - useFood
      
      if (remaining > 0) {
        const hasCooking = p.improvements.some((id) =>
          id.startsWith('Major_Fireplace') || id.startsWith('Major_CookingHearth'))
        const canConvert = p.resources.grain > 0 || p.resources.vegetable > 0 ||
          (hasCooking && (p.resources.sheep > 0 || p.resources.boar > 0 || p.resources.cattle > 0))
        
        if (canConvert) {
          feedQueue.push({ index: i, remaining })
        } else {
          p.resources.begging += remaining
        }
      }
    }

    if (feedQueue.length > 0) {
      const first = feedQueue[0]!
      this.pending = { 
        type: 'harvestFeed', 
        playerIndex: first.index, 
        remaining: first.remaining,
        feedQueue: feedQueue.slice(1)
      }
      return this.respond()
    }

    return this.startBreedPhase()
  }

  private startBreedPhase(): SessionResponse {
    this.state.players.forEach((p) => runEndHarvestFeedingPhaseHooks(this.state, p))
    this.state.players.forEach((p) => runAfterFeedHooks(this.state, p))
    this.applyBreedPhase()
    
    const pendingAnimal = this.state.players.findIndex((p) => this.hasPendingAnimals(p))
    if (pendingAnimal !== -1) {
      this.pending = { type: 'animalReorg', playerIndex: pendingAnimal, spaceId: 'harvest-breed' }
      return this.respond()
    }

    this.state.players.forEach((p) => runEndHarvestHooks(this.state, p))
    this.state.players.forEach((p) => runAfterHarvestHooks(this.state, p))
    return this.finalizeRound()
  }

  private applyBreedPhase() {
    this.state.players.forEach((p) => breedAnimals(p))
  }

  private finalizeRound(): SessionResponse {
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
    this.state.players.forEach((p) => runBeforeStartOfTurnHooks(this.state, p))
    applyRoundGrowth(this.state)
    applyFutureMeeples(this.state)
    applyMajorEffectsToAllPlayers(this.state, 'onRoundStart')
    const startIdx = this.state.players.findIndex((p) => p.startPlayer)
    this.state.currentPlayerIndex = startIdx === -1 ? 0 : startIdx
    this.state.log.unshift({ key: 'log.enterRound', params: { round: this.state.round } })
    this.state.roundStartSnapshot = this.buildRoundSnapshot(this.state)
    this.pending = { type: 'none' }
    this.engine = null
    this.activeSpaceId = null
    this.activePlayerIndex = null
    this.history = []
    this.actionStartIndex = null
    return this.respond()
  }

  loadState(raw: unknown): SessionResponse {
    this.state = normalizeState(raw as GameState)
    if (!this.state.roundStartSnapshot) {
      this.state.roundStartSnapshot = this.buildRoundSnapshot(this.state)
    }
    this.engine = null
    this.pending = { type: 'none' }
    this.history = []
    this.actionStartIndex = null
    return this.respond()
  }

  getStateForRead(): Readonly<GameState> {
    return this.state
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

    const normalized = normalizePlayerFarm(player as Parameters<typeof normalizePlayerFarm>[0])

    switch (farmType) {
      case 'fence': {
        const { edges, extraWood } = payload as { edges: string[]; extraWood?: number }
        const override = this.pending.type === 'choice' ? this.pending.costOverride : undefined
        const woodDiscount = override?.wood ? Math.abs(override.wood) : 0
        const adjustedExtraWood = (extraWood ?? 0) - woodDiscount
        const result = validateFenceSelection(normalized, edges, Math.max(0, adjustedExtraWood))
        if (!result.ok) return this.respond(false, result.error?.code ?? 'validation failed')
        this.pushHistory()
        this.state.players[playerIndex] = result.player as unknown as PlayerState
        break
      }
      case 'room': {
        const { rooms } = payload as {
          rooms: FarmTilePosition[]
        }
        const selection = validateRoomSelection(normalized, rooms)
        if (!selection.ok) return this.respond(false, selection.code)
        const baseCost = getBuildRoomCost(player.houseType as 'wood' | 'clay' | 'stone')
        const override = this.pending.type === 'choice' ? this.pending.costOverride : undefined
        const effectiveCostPerRoom = applyCostOverride(baseCost, override)
        const costKeys = Object.keys(effectiveCostPerRoom) as (keyof Resource)[]
        const totalCost: Partial<Resource> = {}
        for (const key of costKeys) {
          const required = (effectiveCostPerRoom[key] ?? 0) * rooms.length
          if ((normalized.resources[key] ?? 0) < required) {
            return this.respond(false, `Not enough ${key}`)
          }
          totalCost[key] = required
        }
        this.pushHistory()
        for (const key of costKeys) {
          player.resources[key] -= totalCost[key] ?? 0
        }
        player.roomTiles = [...player.roomTiles, ...rooms]
        player.rooms += rooms.length
        break
      }
      case 'stable': {
        const { stables } = payload as { stables: FarmTilePosition[] }
        const selection = validateStableSelection(normalized, stables)
        if (!selection.ok) return this.respond(false, selection.code)
        const woodRequired = stables.length * 2
        if ((normalized.resources?.wood ?? 0) < woodRequired) {
          return this.respond(false, 'Not enough wood')
        }
        this.pushHistory()
        player.resources.wood -= woodRequired
        player.stableTiles = [...player.stableTiles, ...stables]
        break
      }
      case 'plow': {
        const { tile } = payload as { tile: FarmTilePosition }
        const result = validatePlowSelection(normalized, tile)
        if (!result.ok) return this.respond(false, result.error?.code ?? 'validation failed')
        this.pushHistory()
        this.state.players[playerIndex] = result.player as unknown as PlayerState
        break
      }
      case 'sow': {
        const { crops } = payload as { crops: SowSelection[] }
        const result = validateSowSelection(normalized, crops)
        if (!result.ok) return this.respond(false, result.error?.code ?? 'validation failed')
        this.pushHistory()
        this.state.players[playerIndex] = result.player as unknown as PlayerState
        break
      }
    }

    if (!this.engine) {
      this.pending = { type: 'none' }
      return this.respond()
    }

    const space = this.state.actionSpaces.find((s) => s.id === this.activeSpaceId)
    const updatedPlayer = this.state.players[playerIndex]!
    if (!space) return this.respond(false, 'invalid state')

    const result = this.engine.resolveChoice('confirm', { state: this.state, player: updatedPlayer, space })
    this.flushEngineLog()

    if (result.type === 'choice') {
      this.pending = {
        type: 'choice', playerIndex, spaceId: this.activeSpaceId!,
        options: result.options ?? [], promptKey: result.promptKey,
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
      this.actionStartIndex = null
      return this.respond()
    }

    this.runEngineSteps()
    return this.respond()
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
    const modifier = getCardModifier(cardId)
    if (modifier && !player.activeModifiers.some(m => m.cardId === modifier.cardId)) {
      player.activeModifiers.push(modifier)
    }
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
