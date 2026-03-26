import { describe, expect, it } from 'vitest'
import type { ActionSpace, GameState, PlayerState } from '../../game/types'
import { readCardResourceStats } from '../helpers/card-state'
import { payResourcesAction } from '../../actions/effects/pay-resources'
import { bonusVpAction } from '../../actions/effects/bonus-vp'
import { gainOtherPlayersAction } from '../../actions/effects/gain-other-players'

import '../A/A29_AleBenches'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id,
    name,
    color: id === 'p1' ? 'red' : 'blue',
    resources: {
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      food: 0,
      grain: 1,
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
    minorHand: [],
    minorPlayed: ['A29_AleBenches'],
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
    cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3,
    phase: 'work',
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
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    descriptionKey: `actions.${id}.description`,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: {
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
    },
    takenBy: null,
  }) as ActionSpace

describe('A29_AleBenches', () => {
  it('tracks paid grain and food granted to other players', () => {
    const owner = createPlayer('p1', 'Owner')
    const opponent = createPlayer('p2', 'Opponent')
    opponent.resources.grain = 0
    const state = createState(owner, opponent)
    const space = createSpace('return-home')

    const payResult = payResourcesAction.execute({
      state,
      player: owner,
      space,
      params: { grain: 1 },
      sourceCard: 'A29_AleBenches',
    })
    expect(payResult.type).toBe('ok')

    const vpResult = bonusVpAction.execute({
      state,
      player: owner,
      space,
      sourceCard: 'A29_AleBenches',
    })
    expect(vpResult.type).toBe('ok')

    const gainResult = gainOtherPlayersAction.execute({
      state,
      player: owner,
      space,
      params: { food: 1 },
      sourceCard: 'A29_AleBenches',
    })
    expect(gainResult.type).toBe('ok')

    expect(owner.resources.grain).toBe(0)
    expect(opponent.resources.food).toBe(1)
    expect(owner.cardStates?.A29_AleBenches?.counters?.bonusVp).toBe(1)
    expect(readCardResourceStats(owner, 'A29_AleBenches')).toEqual({
      paid: { grain: 1 },
      gained: { food: 1 },
    })
  })
})
