import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import { isCardFlagged, setCardFlag } from '../../shared/cards/helpers/card-state'
import type { GameState, PlayerState } from '../../shared/game/types'

import { markAllWorkersUsed } from '../../shared/game/player'
import '../../shared/cards/C/C22_BasketChair'

const CARD_ID = 'C22_BasketChair'

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
    minorPlayed: [CARD_ID],
    occupationHand: [],
    occupationPlayed: [],houseAnimalType: null,
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

describe('C22_BasketChair session', () => {
  it('onBeforeStartOfTurn offers optional extra place-farmer when workers are available', () => {
    const player = createPlayer('p1', { workersAvailable: 2 })
    const state = createState(3, [player])
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBeforeStartOfTurn!(state, player)
    expect(flow).toBeDefined()
    expect((flow as any).type).toBe('seq')
    expect((flow as any).optional).toBe(true)
    expect((flow as any).children[0].actionId).toBe('place-farmer')
    expect((flow as any).children[0].sourceCard).toBe(CARD_ID)
    expect((flow as any).children[0].actionContext?.extraPlacement).toBe(true)
    expect(isCardFlagged(player, CARD_ID)).toBe(true)
  })

  it('onBeforeStartOfTurn does nothing when the player has no workers available', () => {
    const player = createPlayer('p1')
    const state = createState(3, [player])
    markAllWorkersUsed(state as any, player)
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBeforeStartOfTurn!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onBeforeStartOfTurn does nothing when the card is not in play', () => {
    const player = createPlayer('p1', { minorPlayed: [] })
    const state = createState(3, [player])
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBeforeStartOfTurn!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onRoundEnd clears the card flag for the next round', () => {
    const player = createPlayer('p1')
    setCardFlag(player, CARD_ID, true)
    const state = createState(3, [player])
    const effect = getCardEffect(CARD_ID)
    effect!.onRoundEnd!(state, player)
    expect(isCardFlagged(player, CARD_ID)).toBe(false)
  })
})
