import { describe, expect, it } from 'vitest'
import { executeCardListener, getRegisteredCardListeners } from '../card-listeners'
import type { ActionSpace, GameState, PlayerState } from '../../game/types'
import { placeFarmerAction, OCCUPIED_SPACE_CHOICE_PREFIX } from '../../actions/effects/place-farmer'
import { lessons } from '../action/common-lessons'
import { playOccupationAction } from '../../actions/effects/occupation'
import { HookDispatcher } from '../../engine/dispatcher'
import { constructAction } from '../../actions/effects/construct'
import { A28_ForestSchool as A28Card } from '../A/A28_ForestSchool'

import '../A/A28_ForestSchool'
import '../A/A128_RiparianBuilder'
import '../B/B109_PaperMaker'

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id,
    name,
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

const createSpace = (id: string, overrides: Partial<ActionSpace> = {}): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    descriptionKey: `actions.${id}.description`,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    takenBy: null,
    ...overrides,
  }) as ActionSpace

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

const findListener = (id: string) =>
  getRegisteredCardListeners().find((listener) => listener.id === id)

describe('A28_ForestSchool', () => {
  it('adds occupied lessons spaces as extra place-farmer options', () => {
    const listener = findListener('A28-forest-school-compute-args-place-farmer')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['A28_ForestSchool']
    const state = createState(player)
    state.actionSpaces = [
      createSpace('lessons', { takenBy: 'p2' }),
      createSpace('lessons-4', { takenBy: 'p3' }),
      createSpace('forest'),
    ]

    const result = executeCardListener(listener!, {
      state,
      player,
      space: createSpace('forest'),
      actionId: 'place-farmer',
      phase: 'computeArgs',
      result: {
        type: 'choice',
        options: [{ value: 'forest', labelKey: 'actions.forest.name' }],
      },
    } as any)

    expect(result?.extraOptions).toEqual([
      { value: `${OCCUPIED_SPACE_CHOICE_PREFIX}lessons`, labelKey: 'actions.lessons.name' },
      { value: `${OCCUPIED_SPACE_CHOICE_PREFIX}lessons-4`, labelKey: 'actions.lessons-4.name' },
    ])
  })

  it('lets place-farmer resolve an occupied lessons choice without overwriting the occupant', () => {
    const player = createPlayer()
    player.workersAvailable = 2
    const state = createState(player)
    state.actionSpaces = [createSpace('lessons', { takenBy: 'p2' })]

    const result = placeFarmerAction.resolveChoice!(
      { state, player, space: state.actionSpaces[0] },
      `${OCCUPIED_SPACE_CHOICE_PREFIX}lessons`,
    )

    expect(result.type).toBe('ok')
    expect(state.actionSpaces[0].takenBy).toBe('p2')
    expect(player.workersAvailable).toBe(1)
  })

  it('allows lessons action availability via wood-for-food replacement', () => {
    const player = createPlayer()
    player.minorPlayed = ['A28_ForestSchool']
    player.activeModifiers = [{ ...(A28Card as any).modifier }]
    player.resources.wood = 1
    player.occupationPlayed = ['D152_Patron']
    player.occupationHand = ['A123_FrameBuilder']

    expect(lessons.canBeExecutedByPlayer(createState(player), player)).toBe(true)
    const result = playOccupationAction.execute({ state: createState(player), player, space: createSpace('lessons') })
    expect(result.type).toBe('choice')
  })
})

describe('A128_RiparianBuilder', () => {
  it('grants an optional construct action after an opponent uses reed-bank', () => {
    const listener = findListener('A128-riparian-builder-after-opponent-reed-bank')
    expect(listener).toBeDefined()
    const owner = createPlayer('p1', 'P1')
    owner.occupationPlayed = ['A128_RiparianBuilder']
    const opponent = createPlayer('p2', 'P2')
    const result = executeCardListener(listener!, {
      state: createState(owner, opponent),
      player: opponent,
      space: createSpace('reed-bank'),
      actionId: 'place-farmer',
      phase: 'after',
      result: { type: 'ok' },
    } as any)

    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('construct')
      expect(result.flow.optional).toBe(true)
      expect(result.flow.sourceCard).toBe('A128_RiparianBuilder')
      expect(result.flow.actionContext).toEqual({ maxRooms: 1, trueAction: false })
    }
    expect(owner.cardStates?.A128_RiparianBuilder).toBeUndefined()
    expect(opponent.cardStates?.A128_RiparianBuilder).toBeUndefined()
  })

  it('discounts clay or stone only when the construct action comes from the card', () => {
    const listener = findListener('A128-riparian-builder-costs-construct')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['A128_RiparianBuilder']
    player.houseType = 'clay'

    const clayResult = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('construct'),
      actionId: 'construct',
      phase: 'computeCosts',
      sourceCard: 'A128_RiparianBuilder',
    } as any)
    expect(clayResult?.costs).toEqual({ clay: -1 })

    player.houseType = 'stone'
    const stoneResult = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('construct'),
      actionId: 'construct',
      phase: 'computeCosts',
      sourceCard: 'A128_RiparianBuilder',
    } as any)
    expect(stoneResult?.costs).toEqual({ stone: -2 })
  })

  it('makes discounted construct doable via computeCosts preview when the player can only afford the reduced cost', () => {
    const player = createPlayer()
    player.occupationPlayed = ['A128_RiparianBuilder']
    player.houseType = 'stone'
    player.resources.stone = 3
    player.resources.reed = 2
    const dispatcher = new HookDispatcher()

    const result = dispatcher.applyIsDoable({
      state: createState(player),
      player,
      space: createSpace('construct'),
      actionId: 'construct',
      sourceCard: 'A128_RiparianBuilder',
    } as any, constructAction, false)

    expect(result).toBe(true)
  })
})

describe('B109_PaperMaker', () => {
  it('registers an isDoable listener for play-occupation', () => {
    const listener = findListener('B109-paper-maker-isdoable-occupation')
    expect(listener).toBeDefined()
    expect(listener?.actions).toEqual(['play-occupation'])
  })

  it('returns an optional pay-then-gain flow before playing an occupation', () => {
    const listener = findListener('B109-paper-maker-before-occupation')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.occupationPlayed = ['B109_PaperMaker', 'A123_FrameBuilder']
    player.resources.wood = 1

    const result = executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('lessons'),
      actionId: 'play-occupation',
      phase: 'before',
    } as any)

    expect(result?.flow?.type).toBe('seq')
    if (result?.flow?.type === 'seq') {
      expect(result.flow.optional).toBe(true)
      expect(result.flow.children).toEqual([
        { type: 'leaf', actionId: 'pay-resources', params: { wood: 1 }, sourceCard: 'B109_PaperMaker' },
        { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: 'B109_PaperMaker' },
      ])
    }
  })

  it('makes lessons available when wood can be converted into enough food', () => {
    const player = createPlayer()
    player.occupationPlayed = ['B109_PaperMaker']
    player.resources.food = 0
    player.resources.wood = 1
    player.occupationHand = ['A123_FrameBuilder']

    expect(lessons.canBeExecutedByPlayer(createState(player), player)).toBe(true)
    const result = playOccupationAction.execute({ state: createState(player), player, space: createSpace('lessons') })
    expect(result.type).toBe('choice')
  })
})
