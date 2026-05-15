import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../../contract/types'
import { playImprovement } from '../improvement'

import '../../../cards/A/A7_GardenersKnife'
import '../../../cards/B/B75_WoodWorkshop'
import '../../../cards/C/C60_SmallPottersOven'
import '../../../cards/E/E130_Overachiever'

const createState = (): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players: [],
  actionSpaces: [],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: [],
  gameSeed: 1,
  availableMajorImprovements: ['Major_Fireplace1'],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  workPhaseObtainedResources: {},
})

const createPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
    wood: 0,
    clay: 3,
    reed: 0,
    stone: 0,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
  },
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: ['A53_Claypipe'],
  minorPlayed: [],
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
})

describe('improvement logging', () => {
  it('logs costResources for minor improvement', () => {
    const state = createState()
    const player = createPlayer()
    const result = playImprovement(state, player, 'minor:A53_Claypipe', 'any')
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.immediateLogs).toEqual([
      {
        key: 'log.playMinorImprovement',
        params: {
          improvements: 'A53_Claypipe',
          costResources: { clay: 1 },
        },
      },
    ])
    expect(result.logKey).toBe('log.playMinorImprovement')
    expect(result.logParams).toEqual({
      improvements: 'A53_Claypipe',
      costResources: { clay: 1 },
    })
  })

  it('logs costResources for major improvement', () => {
    const state = createState()
    const player = createPlayer()
    const result = playImprovement(state, player, 'major:Major_Fireplace1', 'any')
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.immediateLogs).toEqual([
      {
        key: 'log.playImprovement',
        params: {
          improvements: 'Major_Fireplace1',
          costResources: { clay: 2 },
        },
      },
    ])
    expect(result.logKey).toBe('log.playImprovement')
    expect(result.logParams).toEqual({
      improvements: 'Major_Fireplace1',
      costResources: { clay: 2 },
    })
  })

  it('emits immediateLogs for major improvement when onBuy returns flow', () => {
    const state = createState()
    state.availableMajorImprovements = ['Major_ClayOven']
    const player = createPlayer()
    player.resources.clay = 3
    player.resources.stone = 1

    const result = playImprovement(state, player, 'major:Major_ClayOven', 'any')

    expect(result.type).toBe('flow')
    if (result.type !== 'flow') return
    expect(result.immediateLogs).toEqual([
      {
        key: 'log.playImprovement',
        params: {
          improvements: 'Major_ClayOven',
          costResources: { clay: 3, stone: 1 },
        },
      },
    ])
  })

  it('returns stable improvementPayment for Fireplace upgrade to Cooking Hearth', () => {
    const state = createState()
    state.availableMajorImprovements = ['Major_CookingHearth1']
    const player = createPlayer()
    player.resources.clay = 0
    player.improvements = ['Major_Fireplace1']

    const result = playImprovement(state, player, 'major:Major_CookingHearth1', 'any')

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.extraData?.improvementPayment).toEqual({
      improvementId: 'Major_CookingHearth1',
      resourcesPaid: {},
      returnedCardId: 'Major_Fireplace1',
    })
  })

  it('does not apply Wood Workshop as a direct wood discount', () => {
    const state = createState()
    state.availableMajorImprovements = []
    const player = createPlayer()
    player.resources.clay = 0
    player.resources.wood = 0
    player.minorHand = ['A7_GardenersKnife']
    player.minorPlayed = ['B75_WoodWorkshop']

    const result = playImprovement(state, player, 'minor:A7_GardenersKnife', 'any')

    expect(result.type).toBe('fail')
    expect(player.minorPlayed).toEqual(['B75_WoodWorkshop'])
    expect(player.resources.wood).toBe(0)
  })

  it('returns onBuy gain flow for Small Potter\'s Oven after payment resolves', () => {
    const state = createState()
    const player = createPlayer()
    player.resources.clay = 2
    player.minorHand = ['C60_SmallPottersOven']
    player.improvements = ['Major_ClayOven']

    const result = playImprovement(state, player, 'C60_SmallPottersOven', 'minor')

    expect(result.type).toBe('flow')
    if (result.type !== 'flow') return
    expect(result.immediateLogs).toEqual([
      {
        key: 'log.playMinorImprovement',
        params: {
          improvements: 'C60_SmallPottersOven',
          costResources: { clay: 2 },
        },
      },
    ])
    expect(result.extraData?.improvementPayment).toEqual({
      improvementId: 'C60_SmallPottersOven',
      resourcesPaid: { clay: 2 },
    })
    expect(result.flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      sourceCard: 'C60_SmallPottersOven',
      params: { food: 5 },
    })
    expect(player.resources.clay).toBe(0)
    expect(player.resources.food).toBe(0)
    expect(player.improvements).not.toContain('Major_ClayOven')
    expect(state.availableMajorImprovements).toContain('Major_ClayOven')
  })

  it('improvement-any with sourceCard applies computeCosts discount', () => {
    const state = createState()
    state.availableMajorImprovements = []
    const player = createPlayer()
    player.resources.clay = 0
    player.minorHand = ['A53_Claypipe']
    player.occupationPlayed = ['E130_Overachiever']

    // Without sourceCard, cannot afford (clay = 0, Claypipe costs 1 clay)
    const resultWithout = playImprovement(state, player, 'minor:A53_Claypipe', 'any')
    expect(resultWithout.type).toBe('fail')

    // With sourceCard = E130_Overachiever, discount applies
    const result = playImprovement(state, player, 'minor:A53_Claypipe', 'any', undefined, 'E130_Overachiever')
    expect(result.type).toBe('ok')
    expect(player.minorPlayed).toContain('A53_Claypipe')
  })
})
