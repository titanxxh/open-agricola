import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../../contract/types'
import { createInitialPlayerStats } from '../../../session/stats'
import { payAction } from '../pay'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'Alice',
  color: 'red',
  resources: { wood: 1, clay: 0, reed: 0, stone: 0, food: 0, grain: 1, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
  workers: [],
  rooms: 2,
  houseType: 'wood',
  fields: [],
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  extraOccupationsFromCards: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  stats: createInitialPlayerStats({ isFirstPlayer: false }),
  supplyTokensConsumed: {},
  ...overrides,
})

const makeState = (player: PlayerState): GameState => ({ players: [player] } as never)

describe('pay supply tokens', () => {
  it('pays fence from reserve without removing built fences', () => {
    const player = makePlayer()
    const state = makeState(player)
    const result = payAction.execute({ state, player, params: { fence: 1 }, sourceCard: 'TestCard', space: undefined as never, eventSink: undefined as never })
    expect(result.type).toBe('ok')
    expect(player.supplyTokensConsumed?.fence).toBe(1)
    expect(player.fenceSegments).toHaveLength(0)
    expect(result.resourcesPaid).toEqual({ fence: 1 })
  })

  it('does not pay fence from E74 card-held fences', () => {
    const player = makePlayer({
      fenceSegments: Array.from({ length: 10 }, (_, i) => ({ edge: `${i},0-H`, type: 'fence' as const, source: { kind: 'own' as const, ownerPlayerId: 'p1' } })),
      cardStates: { E074_AshTrees: { counters: { fences: 5 } } },
    })
    const state = makeState(player)
    const result = payAction.execute({ state, player, params: { fence: 1 }, sourceCard: 'TestCard', space: undefined as never, eventSink: undefined as never })
    expect(result.type).toBe('fail')
  })

  it('pays stable from reserve without adding or removing stable tiles', () => {
    const player = makePlayer()
    const state = makeState(player)
    const result = payAction.execute({ state, player, params: { stable: 1 }, sourceCard: 'TestCard', space: undefined as never, eventSink: undefined as never })
    expect(result.type).toBe('ok')
    expect(player.supplyTokensConsumed?.stable).toBe(1)
    expect(player.stableTiles).toHaveLength(0)
    expect(result.resourcesPaid).toEqual({ stable: 1 })
    expect('stable' in player.resources).toBe(false)
  })
})
