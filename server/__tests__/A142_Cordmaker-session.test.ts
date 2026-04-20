import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { ActionSpace, GameState, PlayerState } from '../../shared/game/types'

import '../../shared/cards/A/A142_Cordmaker'

const CARD_ID = 'A142_Cordmaker'

const createPlayer = (id: string): PlayerState =>
  ({
    id,
    name: id,
    color: 'red',
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
    activeModifiers: [], cardStates: {},
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
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('A142_Cordmaker', () => {
  it('owner gains mandatory xor choice of grain/vegetable when owner collects 2+ reed from reed-bank', () => {
    const listener = findListener('A142-cordmaker-any-collect-reed')
    expect(listener).toBeDefined()

    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)

    const result = executeCardListener(listener!, {
      state: createState(owner),
      player: owner,
      ownerPlayer: owner,
      triggerPlayer: owner,
      space: createSpace('reed-bank'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { reed: 2 } },
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('xor')
    // When owner triggers, it's mandatory (optional: false)
    expect((result!.flow as any).optional).toBe(false)
    const children = (result!.flow as any).children
    expect(children).toHaveLength(2)
    expect(children[0].actionId).toBe('gain')
    expect(children[0].params).toEqual({ grain: 1 })
    // Second branch: pay 2 food, then gain 1 vegetable (BGA: buy 1 vegetable for 2 food)
    expect(children[1].type).toBe('seq')
    const payGainChildren = children[1].children
    const payLeaf = payGainChildren.find((c: any) => c.actionId === 'pay-resources')
    const gainLeaf = payGainChildren.find((c: any) => c.actionId === 'gain')
    expect(payLeaf.params).toEqual({ food: 2 })
    expect(gainLeaf.params).toEqual({ vegetable: 1 })
  })

  it('opponent triggers optional xor choice of grain/vegetable for card owner', () => {
    const listener = findListener('A142-cordmaker-any-collect-reed')!

    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)
    const opponent = createPlayer('p2')

    const result = executeCardListener(listener, {
      state: createState(owner, opponent),
      player: opponent,
      ownerPlayer: owner,
      triggerPlayer: opponent,
      space: createSpace('reed-bank'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { reed: 3 } },
    } as any)

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('xor')
    // When opponent triggers, it's optional for the card owner
    expect((result!.flow as any).optional).toBe(true)
    const children = (result!.flow as any).children
    expect(children).toHaveLength(2)
  })

  it('does not trigger when reed gained < 2', () => {
    const listener = findListener('A142-cordmaker-any-collect-reed')!
    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)

    const result = executeCardListener(listener, {
      state: createState(owner),
      player: owner,
      ownerPlayer: owner,
      triggerPlayer: owner,
      space: createSpace('reed-bank'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { reed: 1 } },
    } as any)

    expect(result).toBeUndefined()
  })

  it('does not trigger on non-reed-bank space', () => {
    const listener = findListener('A142-cordmaker-any-collect-reed')!
    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)

    const result = executeCardListener(listener, {
      state: createState(owner),
      player: owner,
      ownerPlayer: owner,
      triggerPlayer: owner,
      space: createSpace('forest'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { reed: 2 } },
    } as any)

    expect(result).toBeUndefined()
  })

  it('does not trigger when result has no resourcesGained', () => {
    const listener = findListener('A142-cordmaker-any-collect-reed')!
    const owner = createPlayer('p1')
    owner.occupationPlayed.push(CARD_ID)

    const result = executeCardListener(listener, {
      state: createState(owner),
      player: owner,
      ownerPlayer: owner,
      triggerPlayer: owner,
      space: createSpace('reed-bank'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok' },
    } as any)

    expect(result).toBeUndefined()
  })
})
