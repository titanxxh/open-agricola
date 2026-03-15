import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../../game/types'
import { playImprovement } from '../improvement'

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
  familySize: 2,
  workersAvailable: 2,
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
    expect(result.logKey).toBe('log.playImprovement')
    expect(result.logParams).toEqual({
      improvements: 'Major_Fireplace1',
      costResources: { clay: 2 },
    })
  })

  it('improvement-any with sourceCard applies computeCardCosts discount', () => {
    const state = createState()
    state.availableMajorImprovements = []
    const player = createPlayer()
    player.resources.clay = 0
    player.minorHand = ['A53_Claypipe']
    player.minorPlayed = ['E130_Overachiever']

    // Without sourceCard, cannot afford (clay = 0, Claypipe costs 1 clay)
    const resultWithout = playImprovement(state, player, 'minor:A53_Claypipe', 'any')
    expect(resultWithout.type).toBe('fail')

    // With sourceCard = E130_Overachiever, discount applies
    const result = playImprovement(state, player, 'minor:A53_Claypipe', 'any', undefined, 'E130_Overachiever')
    expect(result.type).toBe('ok')
    expect(player.minorPlayed).toContain('A53_Claypipe')
  })
})

