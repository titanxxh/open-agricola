import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import type { CardListenerContext } from '../card-listeners'
import type { GameState, PlayerState } from '../../contract/types'
import { GameSession } from '../../../server/game/authoritative-session'

import '../D/D13_Trowel'

const CARD_ID = 'D13_Trowel'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const baseResources = () => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
}) as PlayerState['resources']

const createPlayer = (overrides: Partial<PlayerState> = {}): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: baseResources(),
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: ['__test_placeholder__'], minorPlayed: [CARD_ID],
    occupationHand: ['__test_placeholder__'], occupationPlayed: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
    ...overrides,
  }) as unknown as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 1, roundPhase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('D13_Trowel listener wiring', () => {
  it('anytime listener emits a renovate-house leaf with params.selectedOption=stone', () => {
    const listener = findListener('D13-trowel-anytime')
    expect(listener).toBeDefined()
    const player = createPlayer({ houseType: 'wood' })
    const state = createState(player)
    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'anytime',
      phase: 'anytime',
    } as unknown as CardListenerContext)
    expect(result?.flow).toBeDefined()
    expect(result!.flow!.type).toBe('leaf')
    if (result!.flow!.type !== 'leaf') return
    expect(result!.flow!.actionId).toBe('renovate-house')
    expect(result!.flow!.sourceCard).toBe(CARD_ID)
    expect(result!.flow!.params?.selectedOption).toBe('stone')
  })

  it('anytime listener is silent when houseType is already stone', () => {
    const listener = findListener('D13-trowel-anytime')!
    const player = createPlayer({ houseType: 'stone' })
    const state = createState(player)
    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'anytime',
      phase: 'anytime',
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

  it('computeChoiceCandidates injects stone target on a wood house when sourceCard matches', () => {
    const listener = findListener('D13-trowel-add-stone-renovation-target')
    expect(listener).toBeDefined()
    const player = createPlayer({ houseType: 'wood' })
    const state = createState(player)
    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeChoiceCandidates',
      sourceCard: CARD_ID,
    } as unknown as CardListenerContext)
    expect(result?.extraOptions?.[0]?.value).toBe('stone')
    expect(result?.extraOptions?.[0]?.sourceCard).toBe(CARD_ID)
  })

  it('computeChoiceCandidates is silent without D13 sourceCard', () => {
    const listener = findListener('D13-trowel-add-stone-renovation-target')!
    const player = createPlayer({ houseType: 'wood' })
    const state = createState(player)
    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

  it('computeCosts on wood + selectedOption=stone returns the food/reed delta', () => {
    const listener = findListener('D13-trowel-compute-costs-renovation')
    expect(listener).toBeDefined()
    const player = createPlayer({ houseType: 'wood', rooms: 2 })
    const state = createState(player)
    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeCosts',
      sourceCard: CARD_ID,
      params: { selectedOption: 'stone' },
    } as unknown as CardListenerContext)
    expect(result?.costs).toEqual({ food: 2, reed: 1 })
  })

  it('computeCosts on clay + selectedOption=stone waives the reed fee', () => {
    const listener = findListener('D13-trowel-compute-costs-renovation')!
    const player = createPlayer({ houseType: 'clay', rooms: 2 })
    const state = createState(player)
    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeCosts',
      sourceCard: CARD_ID,
      params: { selectedOption: 'stone' },
    } as unknown as CardListenerContext)
    expect(result?.costs).toEqual({ reed: -1 })
  })

  it('computeCosts on selectedOption=clay is silent because D13 never resolves through clay', () => {
    const listener = findListener('D13-trowel-compute-costs-renovation')!
    const player = createPlayer({ houseType: 'wood', rooms: 2 })
    const state = createState(player)
    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeCosts',
      sourceCard: CARD_ID,
      params: { selectedOption: 'clay' },
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

  it('computeCosts is silent without D13 sourceCard', () => {
    const listener = findListener('D13-trowel-compute-costs-renovation')!
    const player = createPlayer({ houseType: 'wood', rooms: 2 })
    const state = createState(player)
    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeCosts',
      params: { selectedOption: 'stone' },
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })
})

const setupSession = (overrides: {
  houseType?: 'wood' | 'clay' | 'stone'
  rooms?: number
  resources?: Partial<PlayerState['resources']>
} = {}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.players.forEach((p) => {
    ;(p as PlayerState).minorHand = ['__test_placeholder__']
    ;(p as PlayerState).occupationHand = ['__test_placeholder__']
  })

  const owner = state.players[0]!
  owner.minorPlayed = [...(owner.minorPlayed ?? []), CARD_ID]
  owner.houseType = overrides.houseType ?? 'wood'
  owner.rooms = overrides.rooms ?? 2
  if (overrides.resources) {
    Object.assign(owner.resources, overrides.resources)
  }
  session.loadState(state)
  return session
}

/**
 * Enter an active interaction so `listAnytimeEntries` returns non-empty.
 * Uses farmland → plow → farm-select wait. Requires the player to have at
 * least one worker (the test setup keeps two active workers by default).
 */
const enterActiveInteraction = (session: GameSession) => {
  const resp = session.takeAction(0, 'farmland')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  return resp
}

describe('D13_Trowel session integration', () => {
  it('anytime entry surfaces for a wood-house owner', () => {
    const session = setupSession({ houseType: 'wood' })
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a) => a.id)
    expect(ids).toContain('D13-trowel-anytime')
  })

  it('anytime entry is hidden when the owner already has a stone house', () => {
    const session = setupSession({ houseType: 'stone' })
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a) => a.id)
    expect(ids).not.toContain('D13-trowel-anytime')
  })

  it('wood-house full flow: N stone + N reed + N food spent, houseType becomes stone', () => {
    const session = setupSession({
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 2, reed: 2, food: 2 },
    })
    enterActiveInteraction(session)
    const resp = session.takeAnytimeAction(0, 'D13-trowel-anytime')
    expect(resp.ok).toBe(true)
    const owner = resp.state.players[0]!
    expect(owner.houseType).toBe('stone')
    expect(owner.resources.stone).toBe(0)
    expect(owner.resources.reed).toBe(0)
    expect(owner.resources.food).toBe(0)
  })

  it('wood-house full flow ignores the base clay target even when clay is affordable', () => {
    const session = setupSession({
      houseType: 'wood',
      rooms: 2,
      resources: { clay: 2, stone: 2, reed: 3, food: 2 },
    })
    enterActiveInteraction(session)
    const resp = session.takeAnytimeAction(0, 'D13-trowel-anytime')
    expect(resp.ok).toBe(true)
    const owner = resp.state.players[0]!
    expect(owner.houseType).toBe('stone')
    expect(owner.resources.clay).toBe(2)
    expect(owner.resources.stone).toBe(0)
    expect(owner.resources.reed).toBe(1)
    expect(owner.resources.food).toBe(0)
  })

  it('clay-house full flow: N stone spent, houseType becomes stone, reed untouched', () => {
    const session = setupSession({
      houseType: 'clay',
      rooms: 2,
      resources: { stone: 2, reed: 0, food: 0 },
    })
    enterActiveInteraction(session)
    const resp = session.takeAnytimeAction(0, 'D13-trowel-anytime')
    expect(resp.ok).toBe(true)
    const owner = resp.state.players[0]!
    expect(owner.houseType).toBe('stone')
    expect(owner.resources.stone).toBe(0)
    expect(owner.resources.reed).toBe(0)
  })

  it('wood-house without enough resources: anytime entry is not doable', () => {
    const session = setupSession({
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 0, reed: 0, food: 0 },
    })
    const resp = enterActiveInteraction(session)
    const entry = resp.interaction.anytimeActions.find((a) => a.id === 'D13-trowel-anytime')
    // The anytime build path filters via applyIsDoable; if resources are
    // insufficient for the only legal target (stone), the entry should not
    // surface or the underlying renovate-house probe should refuse it. We
    // accept either: missing entry, or present-but-unusable on invocation.
    if (entry) {
      const ret = session.takeAnytimeAction(0, 'D13-trowel-anytime')
      expect(ret.state.players[0]!.houseType).toBe('wood')
    } else {
      expect(entry).toBeUndefined()
    }
  })
})
