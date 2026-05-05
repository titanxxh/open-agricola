import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource } from '../../game/types'
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

  it('applies major scoring bonus ranges', () => {
    const player = createPlayer()
    player.improvements = ['Major_Joinery']
    player.resources.wood = 5

    const [result] = computeScores(createState(player))
    const cardsBonus = result.categories.find((item) => item.key === 'cardsBonus')
    expect(cardsBonus?.total).toBe(2)
    expect(cardsBonus?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'cardBonus',
          cardId: 'Major_Joinery',
          score: 2,
          quantity: 5,
        }),
      ]),
    )
  })

  it('scores Soldier from wood and stone pairs', () => {
    const player = createPlayer()
    player.occupationPlayed = ['C133_Soldier']
    player.resources.wood = 4
    player.resources.stone = 2

    const [result] = computeScores(createState(player))
    const bonusCategory = result.categories.find((item) => item.key === 'cardStateBonusVp')

    expect(bonusCategory?.total).toBe(2)
    expect(bonusCategory?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'bonus', score: 2 }),
      ]),
    )
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
