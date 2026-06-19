import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource } from '../../contract/types'
import { computeScores } from '../scoring'

// Register card effects used by scoring (e.g. C133_Soldier.computeBonusScore)
import '../../cards/C/C133_Soldier'

const emptyResources = (): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
})

const createPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: emptyResources(),
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [
    { row: 0, col: 0 },
    { row: 0, col: 1 },
  ],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
})

const createState = (player: PlayerState): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players: [player],
  actionSpaces: [],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
})

describe('computeScores', () => {
  it('scores begging cards and empty spaces consistently', () => {
    const player = createPlayer()
    player.resources.begging = 2
    player.minorPlayed = ['A3_PaperKnife']
    player.occupationPlayed = ['B109_PaperMaker']

    const [result] = computeScores(createState(player))
    const byKey = new Map(result.categories.map((item) => [item.key, item]))

    expect(byKey.get('beggings')?.total).toBe(-6)
    expect(byKey.get('cards')?.entries).toHaveLength(2)
    // 3x5 farm - 2 initial rooms
    expect(byKey.get('empty')?.quantity).toBe(13)
  })

  it('scores Joinery resource bonus as attributed Card Bonus VP', () => {
    const player = createPlayer()
    player.improvements = ['Major_Joinery']
    player.resources.wood = 5

    const [result] = computeScores(createState(player))
    const byKey = new Map(result.categories.map((item) => [item.key, item]))
    const cardBonusVp = byKey.get('cardBonusVp')

    expect(byKey.has('cardsBonus')).toBe(false)
    expect(byKey.has('cardStateBonusVp')).toBe(false)
    expect(cardBonusVp?.total).toBe(2)
    expect(cardBonusVp?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'bonus',
          cardId: 'Major_Joinery',
          cardType: 'major',
          score: 2,
        }),
      ]),
    )
    expect(cardBonusVp?.entries).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'cardBonus' }),
        expect.objectContaining({ quantity: expect.any(Number) }),
        expect.objectContaining({ resource: expect.any(String) }),
      ]),
    )
  })

  it('scores duplicate six-player workshops independently by concrete major id', () => {
    const player = createPlayer()
    player.improvements = [
      'Major_Joinery',
      'Major_Joinery2',
      'Major_Pottery',
      'Major_Pottery2',
      'Major_Basket',
      'Major_Basket2',
    ]
    player.resources.wood = 7
    player.resources.clay = 7
    player.resources.reed = 5

    const [result] = computeScores(createState(player))
    const cardBonusVp = result.categories.find((item) => item.key === 'cardBonusVp')

    expect(cardBonusVp?.total).toBe(18)
    expect(cardBonusVp?.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ cardId: 'Major_Joinery', score: 3 }),
      expect.objectContaining({ cardId: 'Major_Joinery2', score: 3 }),
      expect.objectContaining({ cardId: 'Major_Pottery', score: 3 }),
      expect.objectContaining({ cardId: 'Major_Pottery2', score: 3 }),
      expect.objectContaining({ cardId: 'Major_Basket', score: 3 }),
      expect.objectContaining({ cardId: 'Major_Basket2', score: 3 }),
    ]))
  })

  it('scores Soldier from wood and stone pairs', () => {
    const player = createPlayer()
    player.occupationPlayed = ['C133_Soldier']
    player.resources.wood = 4
    player.resources.stone = 2
    player.cardStates = {
      C133_Soldier: {
        extraData: {
          scoringReserveBonus: {
            reserved: { wood: 2, stone: 2 },
            score: 2,
            cardType: 'occupation',
          },
        },
      },
    }

    const [result] = computeScores(createState(player))
    const bonusCategory = result.categories.find((item) => item.key === 'cardBonusVp')

    expect(bonusCategory?.total).toBe(2)
    expect(bonusCategory?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'bonus',
          cardId: 'C133_Soldier',
          cardType: 'occupation',
          score: 2,
        }),
      ]),
    )
  })

  it('counts isField cards (D75/E80/etc) as +1 logical field each', () => {
    const player = createPlayer()
    player.fields = [
      { row: 0, col: 0, stacks: [] },  // 1 normal field
    ]
    player.minorPlayed = ['D75_WoodField', 'E80_RockGarden']  // 2 isField cards
    const [result] = computeScores(createState(player))
    const byKey = new Map(result.categories.map((item) => [item.key, item]))
    // 1 normal field + 2 isField cards = 3 logical fields → range '3' → 2 VP
    expect(byKey.get('fields')?.quantity).toBe(3)
    expect(byKey.get('fields')?.total).toBe(2)
  })

  it('counts mixed-stack field as both grain and vegetable field', () => {
    const player = createPlayer()
    player.fields = [
      {
        row: 1,
        col: 1,
        stacks: [
          { kind: 'vegetable', remaining: 1 },
          { kind: 'grain', remaining: 3 },
        ],
      },
    ]
    const [result] = computeScores(createState(player))
    const byKey = new Map(result.categories.map((item) => [item.key, item]))
    // 1 grain field + 0 grain in reserve = 1 grain count
    expect(byKey.get('grains')?.quantity).toBe(1)
    // 1 vegetable field + 0 in reserve = 1 vegetable count
    expect(byKey.get('vegetables')?.quantity).toBe(1)
  })
})
