import { describe, expect, it } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getPlayedCardKeys } from '../../shared/game/player'
import type { GameState, PlayerState } from '../../shared/game/types'

import '../../shared/cards/B/B3_Moonshine'

const CARD_ID = 'B3_Moonshine'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
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
    rooms: 2, houseType: 'wood' as const,
    fields: [], fences: 0, roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

const createState = (players: PlayerState[]): GameState =>
  ({
    round: 1, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('B3_Moonshine card effect', () => {
  it('onBuy does nothing if no occupation in hand', () => {
    const player = createPlayer('p1')
    const state = createState([player])
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeUndefined()
  })

  it('plays the selected occupation when the player can pay 2 food', () => {
    const player = createPlayer('p1')
    player.occupationHand = ['A9_SheepFarmer']
    player.resources.food = 2
    const state = createState([player])
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    expect(player.occupationHand).toHaveLength(0)
    expect(player.occupationPlayed).toContain('A9_SheepFarmer')
    expect(getPlayedCardKeys(player)).toContain('occupation:A9_SheepFarmer')
    expect(player.resources.food).toBe(0)
  })

  it('passes the selected occupation to the next player when food is insufficient', () => {
    const p1 = createPlayer('p1')
    const p2 = createPlayer('p2')
    p1.occupationHand = ['A9_SheepFarmer']
    p1.resources.food = 1 // cannot afford 2-food play cost
    const state = createState([p1, p2])
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, p1)
    expect(p1.occupationHand).toHaveLength(0)
    expect(p2.occupationHand).toContain('A9_SheepFarmer')
    expect(p1.resources.food).toBe(1) // not spent
  })

  it('selects one occupation from the hand when multiple are available', () => {
    const player = createPlayer('p1')
    player.occupationHand = ['A9_SheepFarmer', 'A124_Knapper']
    player.resources.food = 2
    const snapshot = [...player.occupationHand]
    const state = createState([player])
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    expect(player.occupationPlayed.length).toBe(1)
    expect(player.occupationHand.length).toBe(1)
    const played = player.occupationPlayed[0]!
    expect(snapshot).toContain(played)
  })

  it('returns a noop flow when the effect resolves', () => {
    const player = createPlayer('p1')
    player.occupationHand = ['A9_SheepFarmer']
    player.resources.food = 2
    const state = createState([player])
    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBuy!(state, player) as any
    expect(flow).toBeDefined()
    expect(flow.type).toBe('leaf')
    expect(flow.actionId).toBe('noop')
    expect(flow.sourceCard).toBe(CARD_ID)
  })

  it('discards the occupation in a solo (single-player) game', () => {
    const player = createPlayer('p1')
    player.occupationHand = ['A9_SheepFarmer']
    player.resources.food = 1 // cannot afford play
    const state = createState([player])
    const effect = getCardEffect(CARD_ID)
    effect!.onBuy!(state, player)
    expect(player.occupationHand).toHaveLength(0)
    // No other player exists, so the card is just discarded.
  })
})
