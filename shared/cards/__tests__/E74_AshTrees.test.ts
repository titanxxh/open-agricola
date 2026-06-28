import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import { getCardEffect } from '../card-effects'
import { readPendingFenceBonus, storePendingFenceBonus } from '../helpers/pending-fence-bonus'
import { specialEffectAction } from '../../actions/effects/special-effect'
import type { ActionFlow, ActionSpace, GameState, PlayerState } from '../../contract/types'
import { setFencesForTest } from './__fixtures__/fence'

import '../E/E074_AshTrees'
import type { CardListenerContext } from '../card-listeners'

const createPlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
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
    fields: [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] }, { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] }],
    roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: ['E074_AshTrees'],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    cardStates: { E074_AshTrees: { counters: { fences: 4 } } },
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

const executeSpecialEffectLeaves = (
  flow: ActionFlow | undefined,
  state: GameState,
  player: PlayerState,
  space: ActionSpace = createSpace('test'),
) => {
  if (!flow) return
  if (flow.type === 'seq') {
    flow.children.forEach((child) => executeSpecialEffectLeaves(child, state, player, space))
    return
  }
  if (flow.type !== 'leaf' || flow.actionId !== 'special-effect') return
  specialEffectAction.execute({
    state,
    player,
    space,
    params: flow.params,
    sourceCard: flow.sourceCard,
    actionContext: flow.actionContext,
  })
}

describe('E074_AshTrees', () => {
  it('stores only available fences on buy', () => {
    const effect = getCardEffect('E074_AshTrees')
    const player = createPlayer()
    delete player.cardStates.E074_AshTrees
    setFencesForTest(player, 13)

    effect?.onBuy?.(createState(player), player)

    expect(player.cardStates?.E074_AshTrees?.counters?.fences).toBe(2)
  })

  it('stores only reserve fences after consumed supply tokens', () => {
    const effect = getCardEffect('E074_AshTrees')
    const player = createPlayer()
    delete player.cardStates.E074_AshTrees
    player.supplyTokensConsumed = { fence: 12 }

    effect?.onBuy?.(createState(player), player)

    expect(player.cardStates?.E074_AshTrees?.counters?.fences).toBe(3)
  })

  it('offers free fence count choices before fencing', () => {
    const listener = findListener('E74-ash-trees-before-fence')
    const player = createPlayer()

    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('fence'),
      actionId: 'fence',
      phase: 'before',
    } as unknown as CardListenerContext)

    expect(result?.flow?.type).toBe('xor')
    if (result?.flow?.type !== 'xor') return
    expect(result.flow.optional).toBe(true)
    expect(result.flow.children).toHaveLength(4)
    expect(result.flow.children[0]).toMatchObject({
      type: 'leaf',
      actionId: 'reserve-fence-bonus',
      choiceLabelKey: 'ui.interactionAshTreesUseCount',
      choiceLabelParams: { count: 1 },
    })
  })

  it('marks fence action doable with stored fences even without wood', () => {
    const listener = findListener('E74-ash-trees-isdoable-fence')
    const player = createPlayer()
    player.resources.wood = 0

    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('fence'),
      actionId: 'fence',
      phase: 'isDoable',
      doable: false,
    } as unknown as CardListenerContext)

    expect(result?.doable).toBe(true)
  })

  it('does not create card state while probing isDoable or before-fence', () => {
    const isDoable = findListener('E74-ash-trees-isdoable-fence')
    const beforeFence = findListener('E74-ash-trees-before-fence')
    const player = createPlayer()
    delete player.cardStates.E074_AshTrees
    const state = createState(player)
    const before = JSON.stringify(player.cardStates)

    const isDoableResult = executeCardListener(isDoable!, {
      state,
      player,
      space: createSpace('fence'),
      actionId: 'fence',
      phase: 'isDoable',
      doable: false,
    } as unknown as CardListenerContext)
    const beforeResult = executeCardListener(beforeFence!, {
      state,
      player,
      space: createSpace('fence'),
      actionId: 'fence',
      phase: 'before',
    } as unknown as CardListenerContext)

    expect(isDoableResult).toBeUndefined()
    expect(beforeResult).toBeUndefined()
    expect(JSON.stringify(player.cardStates)).toBe(before)
  })

  it('clears reserved free fences after fencing finishes', () => {
    const listener = findListener('E74-ash-trees-after-fence')
    const player = createPlayer()
    storePendingFenceBonus(player, {
      sourceCard: 'E074_AshTrees',
      counterKey: 'fences',
      freeFences: 2,
    })

    const state = createState(player)
    const result = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('fence'),
      actionId: 'fence',
      phase: 'after',
      choice: 'cancel',
      result: { type: 'ok' },
    } as unknown as CardListenerContext)
    executeSpecialEffectLeaves(result?.flow, state, player)

    expect(readPendingFenceBonus(player)).toBeUndefined()
  })
})
