import { describe, expect, it } from 'vitest'
import { executeCardListener, getRegisteredCardListeners } from '../card-listeners'
import { runCardEffectHook } from '../card-effects'
import { getPlayerActionSpaceConfig } from '../player-action-space'
import type { ActionSpace, GameState, PlayerState } from '../../game/types'
import { clayOven } from '../major/clay-oven'
import { stoneOven } from '../major/stone-oven'

import '../B/B42_ForestInn'
import '../C/C104_Collector'
import '../D/D23_PioneeringSpirit'
import '../E/E53_BoarSpear'
import '../E/E73_Scythe'
import '../E/E74_AshTrees'
import type { CardListenerContext } from '../card-listeners'
import type { ActionExecutionContext } from '../../game/types'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id,
    name: 'P1',
    color: 'red',
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
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as PlayerState

const createState = (players: PlayerState[], spaces: ActionSpace[] = []): GameState =>
  ({
    round: 6,
    roundPhase: 'work',
    currentPlayerIndex: 0,
    players,
    actionSpaces: spaces,
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

const findListener = (id: string) => getRegisteredCardListeners().find((listener) => listener.id === id)

describe('sourceCard card production contract', () => {
  it('major ovens tag their immediate bake onBuy flow', () => {
    const flowClay = clayOven.onBuy?.({} as GameState, {} as PlayerState)
    const flowStone = stoneOven.onBuy?.({} as GameState, {} as PlayerState)

    expect(flowClay).toMatchObject({
      type: 'leaf',
      actionId: 'bake-bread',
      sourceCard: 'Major_ClayOven',
    })
    expect(flowStone).toMatchObject({
      type: 'leaf',
      actionId: 'bake-bread',
      sourceCard: 'Major_StoneOven',
    })
  })

  it('E73 Scythe includes sourceCard on every harvest choice, including decline', () => {
    const player = createPlayer()
    player.minorPlayed = ['E73_Scythe']
    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }] as any
    const flow = runCardEffectHook(createState([player]), player, 'E73_Scythe', 'onStartHarvestFieldPhase')

    expect(flow?.type).toBe('xor')
    if (flow?.type !== 'xor') return
    expect(flow.children).toHaveLength(2)
    for (const child of flow.children) {
      expect(child).toMatchObject({ type: 'leaf', sourceCard: 'E73_Scythe' })
    }
  })

  it('E74 Ash Trees tags the before-fence chooser and skip branch with sourceCard', () => {
    const listener = findListener('E74-ash-trees-before-fence')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['E74_AshTrees']
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
    ] as any
    player.cardStates = { E74_AshTrees: { counters: { fences: 2 } } }

    const result = executeCardListener(listener!, {
      state: createState([player]),
      player,
      space: createSpace('fence'),
      actionId: 'fence',
      phase: 'before',
    } as unknown as CardListenerContext)

    expect(result?.sourceCard).toBe('E74_AshTrees')
    expect(result?.flow?.type).toBe('xor')
    if (result?.flow?.type !== 'xor') return
    for (const child of result.flow.children) {
      expect(child).toMatchObject({ type: 'leaf', sourceCard: 'E74_AshTrees' })
    }
  })

  it('E53 Boar Spear tags both extra options and exchange follow-up with sourceCard', () => {
    const duringListener = findListener('E53-boar-spear-during')
    const afterListener = findListener('E53-boar-spear-after')
    expect(duringListener).toBeDefined()
    expect(afterListener).toBeDefined()
    const player = createPlayer()

    const during = executeCardListener(duringListener!, {
      state: createState([player]),
      player,
      space: createSpace('boar-market'),
      actionId: 'gain',
      phase: 'during',
      result: { type: 'ok', resourcesGained: { boar: 2 } },
    } as unknown as CardListenerContext)

    expect(during?.extraOptions?.map((option) => option.sourceCard)).toEqual([
      'E53_BoarSpear',
      'E53_BoarSpear',
    ])

    const after = executeCardListener(afterListener!, {
      state: createState([player]),
      player,
      space: createSpace('boar-market'),
      actionId: 'gain',
      phase: 'after',
      choice: '1',
      result: { type: 'ok', resourcesGained: { boar: 2 } },
    } as unknown as CardListenerContext)

    expect(after?.sourceCard).toBe('E53_BoarSpear')
    expect(after?.flow).toMatchObject({
      type: 'seq',
      children: [{ type: 'leaf', actionId: 'exchange', sourceCard: 'E53_BoarSpear' }],
    })
  })

  it('D23 Pioneering Spirit card-owned choice options carry sourceCard', () => {
    const config = getPlayerActionSpaceConfig('D23_PioneeringSpirit')
    expect(config).toBeDefined()
    const player = createPlayer()
    const state = createState([player])
    state.round = 6

    const result = config!.createDefinition(player.id).execute({
      state,
      player,
      space: createSpace('D23_PioneeringSpirit'),
    } as unknown as ActionExecutionContext)

    expect(result.type).toBe('choice')
    if (result.type !== 'choice') return
    expect(result.options.map((option) => option.sourceCard)).toEqual([
      'D23_PioneeringSpirit',
      'D23_PioneeringSpirit',
      'D23_PioneeringSpirit',
    ])
  })

  it('C104 Collector preserves sourceCard on both initial and repeated direct choices', () => {
    const config = getPlayerActionSpaceConfig('C104_Collector')
    expect(config).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['C104_Collector']
    const state = createState([player])

    const definition = config!.createDefinition(player.id)
    const first = definition.execute({
      state,
      player,
      space: createSpace('C104_Collector'),
    } as unknown as ActionExecutionContext)

    expect(first.type).toBe('choice')
    if (first.type !== 'choice') return
    expect(first.options.every((option) => option.sourceCard === 'C104_Collector')).toBe(true)

    const retry = definition.resolveChoice?.({
      state,
      player,
      space: createSpace('C104_Collector'),
    } as any, 'wood,clay')
    expect(retry?.type).toBe('choice')
    if (retry?.type !== 'choice') return
    expect(retry.options.every((option) => option.sourceCard === 'C104_Collector')).toBe(true)
  })

  it('B42 Forest Inn tags its direct exchange choices with sourceCard', () => {
    const config = getPlayerActionSpaceConfig('B42_ForestInn')
    expect(config).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['B42_ForestInn']
    player.resources.wood = 9
    const state = createState([player])

    const result = config!.createDefinition(player.id).execute({
      state,
      player,
      space: createSpace('B42_ForestInn'),
    } as unknown as ActionExecutionContext)

    expect(result.type).toBe('choice')
    if (result.type !== 'choice') return
    expect(result.options.map((option) => option.sourceCard)).toEqual([
      'B42_ForestInn',
      'B42_ForestInn',
      'B42_ForestInn',
    ])
  })
})
