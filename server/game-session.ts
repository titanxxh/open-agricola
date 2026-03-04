import type {
  ActionChoiceOption,
  ActionFlow,
  GameState,
  PlayerState,
  Resource,
} from '../shared/game/types.ts'
import { actionDefinitions } from '../shared/actions/index.ts'
import { internalActionDefinitions } from '../shared/actions/internal-actions.ts'
import { clearActionHooks, applyIsDoableHooks } from '../shared/actions/hooks.ts'
import { registerCardHooks } from '../shared/actions/hooks/card-hooks.ts'
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
  isActionForPlayerCount,
  normalizeState,
  resourceKeyList,
  applyRoundGrowth,
  applyFutureMeeples,
} from '../shared/logic/state.ts'
import { applyMajorEffectsToAllPlayers } from '../shared/cards/major/index.ts'
import { runReturnHomeHooks } from '../shared/cards/card-effects.ts'
import { positionKey } from '../shared/game/farm.ts'
import { computeScores } from '../shared/logic/scoring.ts'
import { getPastureCapacity } from '../shared/actions/effects/animals.ts'
import { reap } from '../shared/actions/effects/reap.ts'
import { breedAnimals } from '../shared/actions/effects/breed-animals.ts'
type PendingAction =
  | { type: 'choice'; playerIndex: number; spaceId: string; options: ActionChoiceOption[]; promptKey?: string }
  | { type: 'animalReorg'; playerIndex: number; spaceId: string }
  | { type: 'harvestFeed'; playerIndex: number; remaining: number; feedQueue?: { index: number; remaining: number }[] }
  | { type: 'confirmNextPlayer'; nextPlayerIndex: number }
  | { type: 'none' }

type HistoryEntry = {
  state: GameState
  pending: PendingAction
  activeSpaceId: string | null
  activePlayerIndex: number | null
  engineSnapshot: ReturnType<Engine['snapshot']> | null
  actionStart: boolean
}

export type SessionResponse = {
  ok: boolean
  state: GameState
  pending: PendingAction
  historyLength: number
  hasActionStartSnapshot: boolean
  scores?: ReturnType<typeof computeScores>
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

  constructor(state?: GameState) {
    this.registry = new ActionRegistry()
    actionDefinitions.forEach((a) => this.registry.register(a))
    internalActionDefinitions.forEach((a) => this.registry.register(a))
    clearActionHooks()
    registerCardHooks()
    this.hookDispatcher = new HookDispatcher()
    this.engineLog = new LogStore()

    if (state) {
      this.state = normalizeState(state)
    } else {
      this.state = createInitialState(Date.now())
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

  private respond(ok = true, error?: string): SessionResponse {
    const resp: SessionResponse = {
      ok,
      state: this.state,
      pending: this.pending,
      historyLength: this.history.length,
      hasActionStartSnapshot: this.actionStartIndex !== null,
    }
    if (this.state.gameOver) {
      resp.scores = computeScores(this.state)
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

  private pushHistory(actionStart = false) {
    const entry: HistoryEntry = {
      state: cloneState(this.state),
      pending: this.clonePending(this.pending),
      activeSpaceId: this.activeSpaceId,
      activePlayerIndex: this.activePlayerIndex,
      engineSnapshot: this.engine?.snapshot() ?? null,
      actionStart,
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
        }
        return
      }

      if (step.type === 'choice') {
        if (step.choice.options.length === 1) {
          const auto = step.choice.options[0]
          const result = this.engine.resolveChoice(auto.value, { state: this.state, player, space })
          this.flushEngineLog()
          const isBakeChoice =
            step.choice.promptKey === 'ui.interactionBakeBreadChoice' ||
            step.choice.promptKey === 'ui.interactionBakeBreadCount'
          if (isBakeChoice && auto.value !== 'cancel' && auto.value !== '__skip__') {
            this.usedBakeBreadThisAction = true
          }
          if (isBakeChoice) {
            this.logBakeBreadDelta(before, player)
          }
          if (result.type === 'choice') {
            this.pending = {
              type: 'choice', playerIndex: this.activePlayerIndex, spaceId: this.activeSpaceId,
              options: result.options ?? [], promptKey: result.promptKey,
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
          continue
        }
        this.pending = {
          type: 'choice', playerIndex: this.activePlayerIndex, spaceId: this.activeSpaceId,
          options: step.choice.options, promptKey: step.choice.promptKey,
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
        if (!isActionForPlayerCount(space, this.state.players.length)) return false
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

  takeAction(playerIndex: number, spaceId: string): SessionResponse {
    if (this.state.gameOver) return this.respond(false, 'game is over')
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
      return this.respond()
    }
    if (source === 'harvest-breed') {
      const nextPending = this.state.players.findIndex((p) => this.hasPendingAnimals(p))
      if (nextPending !== -1) {
        this.pending = { type: 'animalReorg', playerIndex: nextPending, spaceId: 'harvest-breed' }
        return this.respond()
      }
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
    // Run onReturnHome hooks for all players' cards before workers return
    this.state.players.forEach((p) => runReturnHomeHooks(this.state, p))
    this.state.players.forEach((p) => { p.workersAvailable = p.familySize })
    this.state.actionSpaces.forEach((s) => { s.takenBy = null })
  }

  private startHarvest(): SessionResponse {
    this.state.players.forEach((p) => reap(p))
    applyMajorEffectsToAllPlayers(this.state, 'onHarvest')

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
    this.applyBreedPhase()
    
    const pendingAnimal = this.state.players.findIndex((p) => this.hasPendingAnimals(p))
    if (pendingAnimal !== -1) {
      this.pending = { type: 'animalReorg', playerIndex: pendingAnimal, spaceId: 'harvest-breed' }
      return this.respond()
    }
    return this.finalizeRound()
  }

  private applyBreedPhase() {
    this.state.players.forEach((p) => breedAnimals(p))
  }

  private finalizeRound(): SessionResponse {
    this.state.players.forEach((p) => { p.newbornCount = 0 })
    this.state.round += 1
    if (this.state.round > 14) {
      this.state.gameOver = true
      this.state.log.unshift({ key: 'log.gameOver' })
      this.pending = { type: 'none' }
      return this.respond()
    }
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

  getRawState(): GameState {
    return this.state
  }

  undoStep(): SessionResponse {
    const entry = this.history.pop()
    if (!entry) return this.respond(false, 'no history to undo')
    this.restoreHistory(entry)
    this.recomputeActionStartIndex()
    return this.respond()
  }

  undoAction(): SessionResponse {
    if (this.actionStartIndex === null) return this.respond(false, 'no action snapshot')
    const entry = this.history[this.actionStartIndex]
    if (!entry) return this.respond(false, 'no action snapshot')
    this.restoreHistory(entry)
    this.history = this.history.slice(0, this.actionStartIndex)
    this.actionStartIndex = null
    return this.respond()
  }
}
