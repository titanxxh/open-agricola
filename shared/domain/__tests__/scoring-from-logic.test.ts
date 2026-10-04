import { beforeEach, describe, expect, it } from 'vitest'
import type { GameState, PlayerState, Resource } from '../../contract/types'
import { computeScores } from '../scoring'
import { CardRegistry } from '../../cards/registry'
import { setActiveCardRegistry } from '../../cards/active-registry'
import { majorCardDefinitions } from '../../cards/major'

import { C133_Soldier_impl } from '../../cards/C/C133_Soldier'
import { M084_BogPony_impl } from '../../cards/M/M084_BogPony'

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
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
})

describe('computeScores', () => {
  beforeEach(() => {
    const registry = new CardRegistry()
    registry.loadImpl('C133_Soldier', C133_Soldier_impl)
    registry.loadImpl('M084_BogPony', M084_BogPony_impl)
    registry.registerEffects(majorCardDefinitions)
    setActiveCardRegistry(registry)
  })

  it('scores begging cards and empty spaces consistently', () => {
    const player = createPlayer()
    player.resources.begging = 2
    player.minorPlayed = ['A003_PaperKnife']
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

    expect(cardBonusVp?.total).toBe(9)
    for (const ids of [['Major_Joinery', 'Major_Joinery2'], ['Major_Pottery', 'Major_Pottery2'], ['Major_Basket', 'Major_Basket2']]) {
      expect(cardBonusVp?.entries.filter((entry) => entry.cardId && ids.includes(entry.cardId))
        .reduce((sum, entry) => sum + entry.score, 0)).toBe(3)
    }
    expect(player.resources).toMatchObject({ wood: 7, clay: 7, reed: 5 })
  })

  it('scores horses only when Farmers of the Moor is enabled', () => {
    const disabledPlayer = createPlayer()
    disabledPlayer.resources.horse = 2
    const [disabled] = computeScores(createState(disabledPlayer))
    expect(disabled.categories.some((category) => category.key === 'horses')).toBe(false)

    const noHorsePlayer = createPlayer()
    noHorsePlayer.resources.horse = 0
    const noHorseState = { ...createState(noHorsePlayer), enableFarmersOfTheMoor: true } as GameState
    const [noHorse] = computeScores(noHorseState)
    expect(noHorse.categories.find((category) => category.key === 'horses')).toMatchObject({
      total: -1,
      quantity: 0,
    })

    const horsePlayer = createPlayer()
    horsePlayer.resources.horse = 2
    const horseState = { ...createState(horsePlayer), enableFarmersOfTheMoor: true } as GameState
    const [horse] = computeScores(horseState)
    expect(horse.categories.find((category) => category.key === 'horses')).toMatchObject({
      total: 2,
      quantity: 2,
    })
  })

  it('scores M084 lying horses as half-value horses', () => {
    const player = createPlayer()
    player.minorPlayed = ['M084_BogPony']
    player.cardStates = {
      M084_BogPony: { extraData: { lyingHorseCount: 1 } },
    }
    player.resources.horse = 2
    const state = { ...createState(player), enableFarmersOfTheMoor: true } as GameState
    const [result] = computeScores(state)

    expect(result.categories.find((category) => category.key === 'horses')).toMatchObject({
      total: 1.5,
      quantity: 2,
    })
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

  it('counts only farmyard fields in the base field score', () => {
    const player = createPlayer()
    player.fields = [
      { row: 0, col: 0, stacks: [] },
    ]
    player.minorPlayed = ['D075_WoodField', 'E080_RockGarden']
    const [result] = computeScores(createState(player))
    const byKey = new Map(result.categories.map((item) => [item.key, item]))
    expect(byKey.get('fields')?.quantity).toBe(1)
    expect(byKey.get('fields')?.total).toBe(-1)
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
