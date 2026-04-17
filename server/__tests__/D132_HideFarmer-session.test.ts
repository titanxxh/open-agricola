import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource } from '../../shared/game/types'
import { computeScores } from '../../shared/logic/scoring'

import '../../shared/cards/D/D132_HideFarmer'

const CARD_ID = 'D132_HideFarmer'

const emptyResources = (): Resource => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
})

const createPlayer = (id = 'p1'): PlayerState => ({
  id, name: id, color: 'red',
  resources: emptyResources(),
  workers: [
    { id: '1', isActive: true, isNewborn: false },
    { id: '2', isActive: true, isNewborn: false },
    { id: '3', isActive: false, isNewborn: false },
    { id: '4', isActive: false, isNewborn: false },
    { id: '5', isActive: false, isNewborn: false },
  ],
  rooms: 2, houseType: 'wood',
  fields: [], fences: 0,
  roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
  stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [],
  occupationHand: [], occupationPlayed: [], playedCards: [],
  houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
  pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 }, startPlayer: false,
  cardStates: {},
}) as PlayerState

const createState = (...players: PlayerState[]): GameState => ({
  round: 14, currentPlayerIndex: 0, players,
  actionSpaces: [], log: [], roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1, availableMajorImprovements: [],
  futureMeeples: [], pendingFutureMeeples: [],
  gameOver: true, workPhaseObtainedResources: {},
}) as GameState

const getCategory = (result: ReturnType<typeof computeScores>[0], key: string) =>
  result.categories.find((c) => c.key === key)

describe('D132_HideFarmer session', () => {
  it('offsets empty space penalty when player has food', () => {
    const player = createPlayer()
    player.occupationPlayed = [CARD_ID]
    // 2 room tiles → 15 - 2 = 13 empty spaces → -13 penalty
    // Give enough food to pay for all
    player.resources.food = 20

    const [result] = computeScores(createState(player))
    const emptyCat = getCategory(result, 'empty')
    expect(emptyCat).toBeDefined()
    expect(emptyCat!.total).toBe(-13) // base penalty still recorded

    // The offset should show up in cardStateBonusVp
    const bonusCat = getCategory(result, 'cardStateBonusVp')
    expect(bonusCat).toBeDefined()
    expect(bonusCat!.total).toBe(13) // offsets all 13 empty spaces
  })

  it('offsets only what food can pay for', () => {
    const player = createPlayer()
    player.occupationPlayed = [CARD_ID]
    player.resources.food = 5 // can only pay for 5 of 13 empty spaces

    const [result] = computeScores(createState(player))
    const emptyCat = getCategory(result, 'empty')
    expect(emptyCat!.total).toBe(-13)

    const bonusCat = getCategory(result, 'cardStateBonusVp')
    expect(bonusCat).toBeDefined()
    expect(bonusCat!.total).toBe(5) // offset only 5
  })

  it('does nothing when no empty spaces', () => {
    const player = createPlayer()
    player.occupationPlayed = [CARD_ID]
    player.resources.food = 10
    // Fill the entire 3x5 farm with rooms + fields + stables
    player.roomTiles = []
    player.fields = []
    player.stableTiles = []
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        if (row === 0 && col <= 1) {
          player.roomTiles.push({ row, col })
        } else {
          player.fields.push({ row, col, crop: null, quantity: 0 })
        }
      }
    }

    const [result] = computeScores(createState(player))
    const emptyCat = getCategory(result, 'empty')
    expect(emptyCat!.total).toBeGreaterThanOrEqual(0)

    // No bonus VP needed since no penalty to offset
    const bonusCat = getCategory(result, 'cardStateBonusVp')
    expect(bonusCat).toBeUndefined()
  })

  it('does nothing when card not played', () => {
    const player = createPlayer()
    // Card NOT played
    player.resources.food = 20

    const [result] = computeScores(createState(player))
    const emptyCat = getCategory(result, 'empty')
    expect(emptyCat!.total).toBe(-13)

    // No bonus VP category at all
    const bonusCat = getCategory(result, 'cardStateBonusVp')
    expect(bonusCat).toBeUndefined()
  })

  it('deducts food from player resources', () => {
    const player = createPlayer()
    player.occupationPlayed = [CARD_ID]
    player.resources.food = 10

    computeScores(createState(player))
    // food should be deducted: paid 10 for 10 of 13 empty spaces
    expect(player.resources.food).toBe(0)
  })
})
