import { describe, expect, it } from 'vitest'
import {
  resolveFutureMeepleRequests,
  removeFutureMeeples,
  buildFutureEntries,
} from '../effects/internal/future-meeples'
import type { GameState } from '../../contract/types'

const createMinimalState = (overrides: Partial<GameState> = {}): GameState =>
  ({
    round: 3,
    roundActionOrder: Array.from({ length: 14 }, (_, i) => `action-${i + 1}`),
    pendingFutureMeeples: [],
    futureMeeples: [],
    ...overrides,
  }) as unknown as GameState

describe('resolveFutureMeepleRequests — entries form', () => {
  it('creates correct FutureMeeple entries from entries array', () => {
    const state = createMinimalState({ round: 3 })
    state.pendingFutureMeeples = [
      {
        cardId: 'TestCard',
        playerId: 'p1',
        entries: [
          { round: 5, resources: { wood: 2 } },
          { round: 7, resources: { stone: 1 } },
        ],
      },
    ]
    resolveFutureMeepleRequests(state)

    expect(state.futureMeeples).toHaveLength(2)
    expect(state.futureMeeples[0]!.round).toBe(5)
    expect(state.futureMeeples[0]!.resources).toEqual({ wood: 2 })
    expect(state.futureMeeples[0]!.playerId).toBe('p1')
    expect(state.futureMeeples[0]!.cardId).toBe('TestCard')
    expect(state.futureMeeples[1]!.round).toBe(7)
    expect(state.futureMeeples[1]!.resources).toEqual({ stone: 1 })
  })

  it('skips entries for rounds <= current round', () => {
    const state = createMinimalState({ round: 5 })
    state.pendingFutureMeeples = [
      {
        cardId: 'TestCard',
        playerId: 'p1',
        entries: [
          { round: 3, resources: { wood: 1 } },
          { round: 5, resources: { wood: 1 } },
          { round: 8, resources: { wood: 1 } },
        ],
      },
    ]
    resolveFutureMeepleRequests(state)

    expect(state.futureMeeples).toHaveLength(1)
    expect(state.futureMeeples[0]!.round).toBe(8)
  })

  it('preserves exact target identity and discards targets after round fourteen', () => {
    const state = createMinimalState({ round: 13 })
    state.pendingFutureMeeples = [{
      cardId: 'ExactTargets',
      playerId: 'p1',
      entries: [
        { round: 14, resources: { food: 1 } },
        { round: 15, resources: { wood: 1 } },
        { round: 16, resources: { clay: 1 } },
      ],
    }]

    resolveFutureMeepleRequests(state)

    expect(state.futureMeeples).toEqual([
      expect.objectContaining({
        cardId: 'ExactTargets',
        round: 14,
        resources: { food: 1 },
      }),
    ])
  })

  it('works alongside simple form requests', () => {
    const state = createMinimalState({ round: 2 })
    state.pendingFutureMeeples = [
      {
        cardId: 'SimpleCard',
        playerId: 'p1',
        startRound: 3,
        count: 2,
        resources: { clay: 1 },
      },
      {
        cardId: 'EntriesCard',
        playerId: 'p2',
        entries: [{ round: 4, resources: { reed: 2 } }],
      },
    ]
    resolveFutureMeepleRequests(state)

    expect(state.futureMeeples).toHaveLength(3)
    const simpleEntries = state.futureMeeples.filter((e) => e.cardId === 'SimpleCard')
    const entriesEntries = state.futureMeeples.filter((e) => e.cardId === 'EntriesCard')
    expect(simpleEntries).toHaveLength(2)
    expect(entriesEntries).toHaveLength(1)
    expect(entriesEntries[0]!.resources).toEqual({ reed: 2 })
  })

  it('keeps only the not-yet-started part of a future prefix through round fourteen', () => {
    const state = createMinimalState({ round: 13 })
    state.pendingFutureMeeples = [
      {
        cardId: 'LatePrefix',
        playerId: 'p1',
        startRound: 14,
        count: 3,
        resources: { food: 1 },
      },
      {
        cardId: 'MissingPrefix',
        playerId: 'p1',
        startRound: 15,
        count: 2,
        resources: { wood: 1 },
      },
    ]

    resolveFutureMeepleRequests(state)

    expect(state.futureMeeples.map((entry) => [entry.cardId, entry.round])).toEqual([
      ['LatePrefix', 14],
    ])
  })

  it('drops the elapsed part of a prefix instead of recreating past rounds', () => {
    const state = createMinimalState({ round: 5 })
    state.pendingFutureMeeples = [{
      cardId: 'StartedPrefix',
      playerId: 'p1',
      startRound: 4,
      count: 4,
      resources: { reed: 1 },
    }]

    resolveFutureMeepleRequests(state)

    expect(state.futureMeeples.map((entry) => entry.round)).toEqual([6, 7])
  })
})

describe('removeFutureMeeples', () => {
  it('removes all entries matching cardId + playerId', () => {
    const state = createMinimalState()
    state.futureMeeples = [
      { id: '1', cardId: 'A', playerId: 'p1', round: 5, actionId: null, resources: { wood: 1 } },
      { id: '2', cardId: 'A', playerId: 'p1', round: 6, actionId: null, resources: { wood: 1 } },
      { id: '3', cardId: 'B', playerId: 'p1', round: 5, actionId: null, resources: { clay: 1 } },
    ]
    removeFutureMeeples(state, { playerId: 'p1', cardId: 'A' })

    expect(state.futureMeeples).toHaveLength(1)
    expect(state.futureMeeples[0]!.cardId).toBe('B')
  })

  it('with rounds filter only removes specific rounds', () => {
    const state = createMinimalState()
    state.futureMeeples = [
      { id: '1', cardId: 'A', playerId: 'p1', round: 5, actionId: null, resources: { wood: 1 } },
      { id: '2', cardId: 'A', playerId: 'p1', round: 6, actionId: null, resources: { wood: 1 } },
      { id: '3', cardId: 'A', playerId: 'p1', round: 7, actionId: null, resources: { wood: 1 } },
    ]
    removeFutureMeeples(state, { playerId: 'p1', cardId: 'A', rounds: [5, 7] })

    expect(state.futureMeeples).toHaveLength(1)
    expect(state.futureMeeples[0]!.round).toBe(6)
  })
})

describe('buildFutureEntries', () => {
  it('generates correct round + resources array', () => {
    const result = buildFutureEntries(3, [
      { offset: 1, resources: { wood: 1 } },
      { offset: 3, resources: { stone: 2 } },
    ])

    expect(result).toEqual([
      { round: 4, resources: { wood: 1 } },
      { round: 6, resources: { stone: 2 } },
    ])
  })
})
