import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import type { GameState, PlayerState } from '../../shared/game/types'

import '../../shared/cards/E/E125_DelayedWayfarer'

const CARD_ID = 'E125_DelayedWayfarer'

const createPlayer = (
  id = 'p1',
  overrides: Partial<PlayerState> = {},
): PlayerState =>
  ({
    id,
    name: id,
    color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2,
    houseType: 'wood' as const,
    fields: [],
    fences: 0,
    roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [],
    minorHand: [],
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [CARD_ID],houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
    cardStates: {},
    ...overrides,
  }) as unknown as PlayerState

const createState = (round: number, players: PlayerState[]): GameState =>
  ({
    round,
    currentPlayerIndex: 0,
    players,
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('E125_DelayedWayfarer card effect', () => {
  it('onBuy returns a seq flow with XOR building-resource choice and queues a future-meeple for next round', () => {
    const player = createPlayer('p1')
    const state = createState(3, [player])
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect((flow as any).type).toBe('seq')
    const xor = (flow as any).children[0]
    expect(xor.type).toBe('xor')
    expect(xor.children).toHaveLength(4)
    const gains = xor.children.map((c: any) => c.params)
    expect(gains).toEqual(
      expect.arrayContaining([
        { wood: 1 },
        { clay: 1 },
        { reed: 1 },
        { stone: 1 },
      ]),
    )
    expect(state.pendingFutureMeeples).toHaveLength(1)
    const req = state.pendingFutureMeeples[0]!
    if ('entries' in req) {
      expect(req.entries[0]!.round).toBe(4)
      expect(req.playerId).toBe('p1')
      expect(req.cardId).toBe(CARD_ID)
    }
  })

  it('onBuy at round 14 only emits the building-resource XOR (no queue)', () => {
    const player = createPlayer('p1')
    const state = createState(14, [player])
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect((flow as any).type).toBe('xor')
    expect(state.pendingFutureMeeples).toHaveLength(0)
  })

  it('onRoundStart offers an optional place-farmer when a matching future-meeple entry is present', () => {
    const player = createPlayer('p1')
    const state = createState(4, [player])
    state.futureMeeples.push({
      id: `${CARD_ID}-p1-4-0`,
      cardId: CARD_ID,
      playerId: 'p1',
      round: 4,
      actionId: null,
      resources: {},
    })
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeDefined()
    expect((flow as any).type).toBe('seq')
    expect((flow as any).optional).toBe(true)
    expect((flow as any).children[0].actionId).toBe('place-farmer')
    expect((flow as any).children[0].sourceCard).toBe(CARD_ID)
    expect(isCardFlagged(player, CARD_ID)).toBe(true)
  })

  it('onRoundStart does nothing when no matching future-meeple entry exists', () => {
    const player = createPlayer('p1')
    const state = createState(5, [player])
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onRoundStart fires only once even when the hook is invoked twice (flag guard)', () => {
    const player = createPlayer('p1')
    const state = createState(4, [player])
    state.futureMeeples.push({
      id: `${CARD_ID}-p1-4-0`,
      cardId: CARD_ID,
      playerId: 'p1',
      round: 4,
      actionId: null,
      resources: {},
    })
    const effect = getCardEffect(CARD_ID)
    expect(effect!.onRoundStart!(state, player)).toBeDefined()
    expect(effect!.onRoundStart!(state, player)).toBeUndefined()
  })

  it('onRoundStart does nothing when the card is not played', () => {
    const player = createPlayer('p1', { occupationPlayed: [] })
    const state = createState(4, [player])
    state.futureMeeples.push({
      id: `${CARD_ID}-p1-4-0`,
      cardId: CARD_ID,
      playerId: 'p1',
      round: 4,
      actionId: null,
      resources: {},
    })
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onRoundStart!(state, player)
    expect(flow).toBeUndefined()
  })
})
