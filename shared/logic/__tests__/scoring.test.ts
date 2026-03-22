import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource } from '../../game/types'
import { computeScores } from '../scoring'

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
  familySize: 2,
  workersAvailable: 2,
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
  occupationPlayed: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  newbornCount: 0,
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
})
