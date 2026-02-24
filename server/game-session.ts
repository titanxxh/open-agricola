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
  createRoundSnapshot,
  cloneState,
  harvestRounds,
  isActionForPlayerCount,
  normalizeState,
  applyRoundGrowth,
  applyFutureMeeples,
} from '../shared/logic/state.ts'
import { applyMajorEffectsToAllPlayers } from '../shared/actions/cards/major/index.ts'
import { computeScores } from '../shared/logic/scoring.ts'
import { getPastureCapacity } from '../shared/actions/effects/animals.ts'
import { breedAnimals } from '../shared/actions/effects/breed-animals.ts'
import { reap } from '../shared/actions/effects/reap.ts'

type PendingAction =
  | { type: 'choice'; playerIndex: number; spaceId: string; options: ActionChoiceOption[]; promptKey?: string }
  | { type: 'animalReorg'; playerIndex: number; spaceId: string }
  | { type: 'harvestFeed'; playerIndex: number; remaining: number }
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

  private runEngineSteps(): void {
    if (!this.engine || this.activePlayerIndex === null || !this.activeSpaceId) return
    const player = this.state.players[this.activePlayerIndex]
    const space = this.state.actionSpaces.find((s) => s.id === this.activeSpaceId)
    if (!player || !space) return

    while (true) {
      const before = this.clonePlayer(player)
      const step = this.engine.proceed({ state: this.state, player, space })

      if (step.type === 'blocked' || step.type === 'done') {
        this.engine = null
        const next = this.nextPlayerIdx(this.state.players, this.state.currentPlayerIndex)
        this.pending = { type: 'confirmNextPlayer', nextPlayerIndex: next }
        return
      }

      if (step.type === 'choice') {
        if (step.choice.options.length === 1) {
          const auto = step.choice.options[0]
          const result = this.engine.resolveChoice(auto.value, { state: this.state, player, space })
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
    if (this.pending.type !== 'choice' || this.pending.playerIndex !== playerIndex) {
      return this.respond(false, 'no pending choice for this player')
    }
    if (!this.engine) return this.respond(false, 'no active engine')
    const player = this.state.players[playerIndex]
    const space = this.state.actionSpaces.find((s) => s.id === this.activeSpaceId)
    if (!player || !space) return this.respond(false, 'invalid state')

    this.pushHistory()
    const result = this.engine.resolveChoice(value, { state: this.state, player, space })
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
      return this.respond()
    }
    this.runEngineSteps()
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
      const next = this.nextPlayerIdx(this.state.players, this.state.currentPlayerIndex)
      this.pending = { type: 'confirmNextPlayer', nextPlayerIndex: next }
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

    const nextFeedPlayer = this.state.players.findIndex((p, idx) => {
      if (idx <= playerIndex) return false
      const newborn = Math.min(p.newbornCount, p.familySize)
      const req = Math.max(0, p.familySize * 2 - newborn)
      return req > p.resources.food
    })
    if (nextFeedPlayer !== -1) {
      const p = this.state.players[nextFeedPlayer]!
      const newborn = Math.min(p.newbornCount, p.familySize)
      const req = Math.max(0, p.familySize * 2 - newborn)
      const useFood = Math.min(p.resources.food, req)
      p.resources.food -= useFood
      this.pending = { type: 'harvestFeed', playerIndex: nextFeedPlayer, remaining: req - useFood }
      return this.respond()
    }

    this.applyBreedPhase()
    const pendingAnimal = this.state.players.findIndex((p) => this.hasPendingAnimals(p))
    if (pendingAnimal !== -1) {
      this.pending = { type: 'animalReorg', playerIndex: pendingAnimal, spaceId: 'harvest-breed' }
      return this.respond()
    }
    return this.finalizeRound()
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
    this.state.players.forEach((p) => { p.workersAvailable = p.familySize })
    this.state.actionSpaces.forEach((s) => { s.takenBy = null })
  }

  private startHarvest(): SessionResponse {
    this.state.players.forEach((p) => reap(p))
    applyMajorEffectsToAllPlayers(this.state, 'onHarvest')

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
          this.pending = { type: 'harvestFeed', playerIndex: i, remaining }
          return this.respond()
        }
        p.resources.begging += remaining
      }
    }

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

  undoRound(): SessionResponse {
    const roundSnapshot = this.state.roundStartSnapshot
      ? cloneState(this.state.roundStartSnapshot)
      : this.buildRoundSnapshot(this.state)
    this.state = roundSnapshot
    this.state.players.forEach((p) => { p.workersAvailable = p.familySize })
    this.state.actionSpaces.forEach((space) => { space.takenBy = null })
    this.state.roundStartSnapshot = this.buildRoundSnapshot(this.state)
    this.pending = { type: 'none' }
    this.engine = null
    this.activeSpaceId = null
    this.activePlayerIndex = null
    this.history = []
    this.actionStartIndex = null
    return this.respond()
  }
}
