import { describe, expect, it } from 'vitest'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../card-listeners'
import { getCardEffect } from '../card-effects'
import type { ActionSpace, GameState, PlayerState } from '../../game/types'

import '../B/B34_SpecialFood'
import '../B/B103_FieldMerchant'
import '../C/C71_SlurrySpreader'
import { B103_FieldMerchant as B103Card } from '../B/B103_FieldMerchant'

const createPlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
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

const createSpace = (id: string, gainPerRound: Partial<ActionSpace['resources']> = {}): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    descriptionKey: `actions.${id}.description`,
    roundAvailable: 1,
    gainPerRound,
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    takenBy: null,
  }) as ActionSpace

const findListener = (id: string) =>
  getRegisteredCardListeners().find((listener) => listener.id === id)

describe('B103_FieldMerchant', () => {
  it('marks improvement actions doable so they can be declined', () => {
    const listener = findListener('B103-field-merchant-isdoable-improvement')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['B103_FieldMerchant']

    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('major-improvement'),
      actionId: 'improvement-any',
      phase: 'isDoable',
      doable: false,
    } as any)

    expect(result?.doable).toBe(true)
  })

  it('offers only food when declining a minor-improvement action', () => {
    const listener = findListener('B103-field-merchant-replace-improvement')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['B103_FieldMerchant']

    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('meeting-place'),
      actionId: 'minor-improvement',
      phase: 'computeReplace',
    } as any)

    expect(result?.decline).toBe(true)
    expect(result?.alternativeFlow).toEqual({
      type: 'xor',
      promptKey: 'ui.interactionFieldMerchantChoose',
      children: [{ type: 'leaf', actionId: 'gain', params: { food: 1 } }],
    })
  })

  it('has an immediate wood and reed reward when played', () => {
    expect((B103Card as any).reward).toEqual({ wood: 1, reed: 1 })
  })
})

describe('B34_SpecialFood', () => {
  it('grants bonus vp flow after fully accommodating collected animals', () => {
    const beforeListener = findListener('B34-special-food-before-collect')
    const afterListener = findListener('B34-special-food-after-collect')
    expect(beforeListener).toBeDefined()
    expect(afterListener).toBeDefined()

    const player = createPlayer()
    player.minorPlayed = ['B34_SpecialFood']
    const state = createState(player)
    const sheepSpace = createSpace('sheep-market', { sheep: 1 })

    executeCardListener(beforeListener!, {
      state,
      player,
      space: sheepSpace,
      actionId: 'collect',
      phase: 'before',
    } as any)

    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 2

    const result = executeCardListener(afterListener!, {
      state,
      player,
      space: sheepSpace,
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { sheep: 2 } },
    } as any)

    expect(result?.flow).toEqual({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: 'B34_SpecialFood' },
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: 'B34_SpecialFood' },
        { type: 'leaf', actionId: 'flag-card', sourceCard: 'B34_SpecialFood' },
      ],
    })
  })
})

describe('C71_SlurrySpreader', () => {
  it('grants an optional sow action after breeding two animal types', () => {
    const effect = getCardEffect('C71_SlurrySpreader')
    expect(effect).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['C71_SlurrySpreader']
    player.resources.sheep = 2
    player.resources.boar = 2
    const state = createState(player)

    effect?.onEndHarvestFeedingPhase?.(state, player)
    player.resources.sheep = 3
    player.resources.boar = 3

    const flow = effect?.onEndHarvest?.(state, player)
    expect(flow).toEqual({
      type: 'leaf',
      actionId: 'sow',
      optional: true,
      promptKey: 'ui.interactionSowSelect',
      sourceCard: 'C71_SlurrySpreader',
    })
  })
})
