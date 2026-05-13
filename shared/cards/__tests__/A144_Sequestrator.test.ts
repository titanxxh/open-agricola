import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import { getCardEffect } from '../card-effects'
import type { ActionSpace, GameState, PlayerState } from '../../contract/types'

import '../A/A144_Sequestrator'
import type { CardListenerContext } from '../card-listeners'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id, name, color: id === 'p1' ? 'red' : 'blue',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
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
    cardStates: {},
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

const findListener = (id: string) => getRegisteredCardListeners().find((listener) => listener.id === id)

describe('A144_Sequestrator', () => {
  it('stores reed and clay on buy', () => {
    const effect = getCardEffect('A144_Sequestrator')
    const player = createPlayer()
    player.occupationPlayed = ['A144_Sequestrator']

    effect?.onBuy?.(createState(player), player)

    expect(player.cardStates?.A144_Sequestrator?.counters).toMatchObject({
      reed: 3,
      clay: 4,
    })
  })

  it('returns a flow to release stored reed to the first player reaching 3 pastures', () => {
    const owner = createPlayer('p1', 'Owner')
    owner.occupationPlayed = ['A144_Sequestrator']
    owner.cardStates = { A144_Sequestrator: { counters: { reed: 3, clay: 4 } } }
    const triggerPlayer = createPlayer('p2', 'Trigger')
    triggerPlayer.pastures = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as any
    const listener = findListener('A144-sequestrator-after-fencing')

    const result = executeCardListener(listener!, {
      state: createState(owner, triggerPlayer),
      player: triggerPlayer,
      space: createSpace('fence'),
      actionId: 'fence',
      phase: 'after',
      result: { type: 'ok' },
    } as unknown as CardListenerContext)

    expect(result?.flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: 'A144_Sequestrator',
          params: { kind: 'set-counter', key: 'reed', value: 0 },
        },
        {
          type: 'leaf',
          actionId: 'gain',
          sourceCard: 'A144_Sequestrator',
          params: { reed: 3, recipientPlayerId: 'p2' },
        },
      ],
    })
    expect(result?.logKey).toBeUndefined()
    expect(result?.logParams).toBeUndefined()
    expect(triggerPlayer.resources.reed).toBe(0)
    expect(owner.cardStates?.A144_Sequestrator?.counters?.reed).toBe(3)
  })

  it('returns a flow to release stored clay to the first player reaching 5 fields', () => {
    const owner = createPlayer('p1', 'Owner')
    owner.occupationPlayed = ['A144_Sequestrator']
    owner.cardStates = { A144_Sequestrator: { counters: { reed: 3, clay: 4 } } }
    const triggerPlayer = createPlayer('p2', 'Trigger')
    triggerPlayer.fields = new Array(5).fill(null).map((_, index) => ({
      row: 0,
      col: index,
      crop: null,
      remaining: 0,
    })) as any
    const listener = findListener('A144-sequestrator-after-plow')

    const result = executeCardListener(listener!, {
      state: createState(owner, triggerPlayer),
      player: triggerPlayer,
      space: createSpace('plow'),
      actionId: 'plow',
      phase: 'after',
      result: { type: 'ok' },
    } as unknown as CardListenerContext)

    expect(result?.flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: 'A144_Sequestrator',
          params: { kind: 'set-counter', key: 'clay', value: 0 },
        },
        {
          type: 'leaf',
          actionId: 'gain',
          sourceCard: 'A144_Sequestrator',
          params: { clay: 4, recipientPlayerId: 'p2' },
        },
      ],
    })
    expect(result?.logKey).toBeUndefined()
    expect(result?.logParams).toBeUndefined()
    expect(triggerPlayer.resources.clay).toBe(0)
    expect(owner.cardStates?.A144_Sequestrator?.counters?.clay).toBe(4)
  })

  it('returns no flow when the threshold is met but the stored resource is empty', () => {
    const owner = createPlayer('p1', 'Owner')
    owner.occupationPlayed = ['A144_Sequestrator']
    owner.cardStates = { A144_Sequestrator: { counters: { reed: 0, clay: 4 } } }
    const triggerPlayer = createPlayer('p2', 'Trigger')
    triggerPlayer.pastures = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as any
    const listener = findListener('A144-sequestrator-after-fencing')

    const result = executeCardListener(listener!, {
      state: createState(owner, triggerPlayer),
      player: triggerPlayer,
      space: createSpace('fence'),
      actionId: 'fence',
      phase: 'after',
      result: { type: 'ok' },
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
    expect(triggerPlayer.resources.reed).toBe(0)
    expect(owner.cardStates?.A144_Sequestrator?.counters?.reed).toBe(0)
  })
})
