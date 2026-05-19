import { describe, expect, it } from 'vitest'
import type { ActionSpace, GameState, PlayerState } from '../../contract/types'
import { readCardResourceStats } from '../helpers/card-state'
import { payAction as payResourcesAction } from '../../actions/effects/pay'
import { bonusVpAction } from '../../actions/effects/bonus-vp'
import { gainAction } from '../../actions/effects/gain'

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
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
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
    occupationPlayed: [],houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3,
    roundPhase: 'work',
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
    takenBy: [],
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

    const gainResult = gainAction.execute({
      state,
      player: owner,
      space,
      params: { recipientMode: 'others', food: 1 },
      sourceCard: 'A29_AleBenches',
    })
    expect(gainResult.type).toBe('ok')

    expect(owner.resources.grain).toBe(0)
    expect(opponent.resources.food).toBe(1)
    expect(owner.cardStates?.A29_AleBenches?.counters?.bonusVp).toBe(1)
    expect(readCardResourceStats(owner, 'A29_AleBenches')).toMatchObject({
      paid: { grain: 1 },
      gained: { food: 1 },
    })
  })
})
