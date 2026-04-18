import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace } from '../../game/types'
import { readCardResourceStats } from '../helpers/card-state'

import '../A/A37_Bucksaw'
import { payResourcesAction } from '../../actions/effects/pay-resources'
import { bonusVpAction } from '../../actions/effects/bonus-vp'
import { gainAction } from '../../actions/effects/gain'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id, name, color: 'red',
    resources: {
      wood: 5, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) => getRegisteredCardListeners().find(l => l.id === id)

describe('A37_Bucksaw', () => {
  it('returns optional pay-gain flow after renovate', () => {
    const listener = findListener('A37-bucksaw-after-renovate')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['A37_Bucksaw']
    const result = executeCardListener(listener!, {
      state: createState(player), player, space: createSpace('renovate-house'),
      actionId: 'renovate-house', phase: 'after',
    } as any)
    expect(result?.flow?.type).toBe('seq')
    if (result?.flow?.type === 'seq') {
      expect(result.flow.optional).toBe(true)
      expect(result.flow.children).toEqual([
        {
          type: 'leaf',
          actionId: 'pay-resources',
          params: { wood: 1 },
          sourceCard: 'A37_Bucksaw',
          choiceLabelKey: 'ui.interactionResourceExchange',
          choiceLabelParams: {
            resourcesPaid: { wood: 1 },
            resourcesGained: { grain: 1 },
            bonusVp: 1,
          },
        },
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: 'A37_Bucksaw' },
        { type: 'leaf', actionId: 'gain', params: { grain: 1 }, sourceCard: 'A37_Bucksaw' },
      ])
    }
  })

  it('bonus-vp action records card bonus points', () => {
    const player = createPlayer()
    player.minorPlayed = ['A37_Bucksaw']
    const result = bonusVpAction.execute({
      state: createState(player),
      player,
      space: createSpace('renovate-house'),
      sourceCard: 'A37_Bucksaw',
    })
    expect(result.type).toBe('ok')
    expect(player.cardStates?.A37_Bucksaw?.counters?.bonusVp).toBe(1)
  })

  it('pay-resources action deducts wood', () => {
    const player = createPlayer()
    const payResult = payResourcesAction.execute({
      state: createState(player),
      player,
      space: createSpace('renovate-house'),
      params: { wood: 1 },
      sourceCard: 'A37_Bucksaw',
    })
    expect(payResult.type).toBe('ok')
    expect(player.resources.wood).toBe(4)
  })

  it('tracks paid and gained resources under card resource stats', () => {
    const player = createPlayer()

    const payResult = payResourcesAction.execute({
      state: createState(player),
      player,
      space: createSpace('renovate-house'),
      params: { wood: 1 },
      sourceCard: 'A37_Bucksaw',
    })
    expect(payResult.type).toBe('ok')

    const gainResult = gainAction.execute({
      state: createState(player),
      player,
      space: createSpace('renovate-house'),
      params: { grain: 1 },
      sourceCard: 'A37_Bucksaw',
    })
    expect(gainResult.type).toBe('ok')
    expect(readCardResourceStats(player, 'A37_Bucksaw')).toEqual({
      paid: { wood: 1 },
      gained: { grain: 1 },
    })
  })
})
