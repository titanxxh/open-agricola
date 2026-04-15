import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../card-effects'
import { runCardEffectHook } from '../card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'

import '../E/E143_Hewer'

const CARD_ID = 'E143_Hewer'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    familySize: 2, workersAvailable: 2, rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [CARD_ID], playedCards: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    newbornCount: 0, pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
  }) as PlayerState

const createSpace = (id: string, overrides?: Partial<ActionSpace>): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
    ...overrides,
  }) as ActionSpace

const createState = (players: PlayerState[], round = 3): GameState =>
  ({
    round, currentPlayerIndex: 0, players,
    actionSpaces: [
      createSpace('clay-pit', { gainPerRound: { clay: 1 } }),
    ],
    log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

describe('E143_Hewer', () => {
  it('effect is registered', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).not.toBeNull()
    expect(effect!.onBeforeReturnHome).toBeDefined()
  })

  it('gains stone + food when clay-pit is unoccupied and round >= 3', () => {
    const player = createPlayer()
    const state = createState([player], 3)
    // clay-pit is unoccupied (takenBy: null)
    const flow = runCardEffectHook(state, player, CARD_ID, 'onBeforeReturnHome')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as any).actionId).toBe('gain')
    expect((flow as any).params).toEqual({ stone: 1, food: 1 })
  })

  it('does not trigger when round < 3', () => {
    const player = createPlayer()
    const state = createState([player], 2)
    const flow = runCardEffectHook(state, player, CARD_ID, 'onBeforeReturnHome')
    expect(flow).toBeNull()
  })

  it('does not trigger when clay-pit is occupied', () => {
    const player = createPlayer()
    const state = createState([player], 5)
    const clayPit = state.actionSpaces.find(s => s.id === 'clay-pit')!
    clayPit.takenBy = 'p2'
    const flow = runCardEffectHook(state, player, CARD_ID, 'onBeforeReturnHome')
    expect(flow).toBeNull()
  })

  it('does not trigger when card is not played', () => {
    const player = createPlayer()
    player.occupationPlayed = []
    const state = createState([player], 5)
    const flow = runCardEffectHook(state, player, CARD_ID, 'onBeforeReturnHome')
    expect(flow).toBeNull()
  })
})
