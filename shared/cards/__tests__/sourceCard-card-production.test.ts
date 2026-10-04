import { describe, expect, it } from 'vitest'
import { executeCardListener, getRegisteredCardListeners } from '../card-listeners'
import { runCardEffectHook } from '../card-effects'
import { getPlayerActionSpaceConfig } from '../player-action-space'
import type { ActionSpace, GameState, PlayerState } from '../../contract/types'
import { getMajorCard } from '../major'

import '../B/B042_ForestInn'
import '../C/C104_Collector'
import '../D/D023_PioneeringSpirit'
import '../E/E053_BoarSpear'
import '../E/E073_Scythe'
import '../E/E074_AshTrees'
import type { CardListenerContext } from '../card-listeners'
import type { ActionExecutionContext } from '../../contract/types'
import type { DraftGameEvent } from '../../contract/events'

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
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as GameState

const movedToPlayer = (
  resources: DraftGameEvent<'resource.moved'>['resources'],
  playerId = 'p1',
  from: DraftGameEvent<'resource.moved'>['from'] = { kind: 'actionSpace', spaceId: 'test-space' },
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources,
  from,
  to: { kind: 'player', playerId },
  reason: from.kind === 'actionSpace' ? 'collect' : 'gain',
})

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
    const clayOven = getMajorCard('Major_ClayOven')
    const stoneOven = getMajorCard('Major_StoneOven')
    const flowClay = clayOven?.onBuy?.({} as GameState, {} as PlayerState)
    const flowStone = stoneOven?.onBuy?.({} as GameState, {} as PlayerState)

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

  it('E73 Scythe includes sourceCard on every harvest choice', () => {
    const player = createPlayer()
    player.minorPlayed = ['E073_Scythe']
    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }] as any
    const flow = runCardEffectHook(createState([player]), player, 'E073_Scythe', 'onStartHarvestFieldPhase')

    expect(flow?.type).toBe('xor')
    if (flow?.type !== 'xor') return
    expect(flow.optional).toBe(true)
    expect(flow.children).toHaveLength(1)
    for (const child of flow.children) {
      expect(child).toMatchObject({ type: 'leaf', sourceCard: 'E073_Scythe' })
    }
  })

  it('E74 Ash Trees tags the before-fence chooser and skip branch with sourceCard', () => {
    const listener = findListener('E74-ash-trees-before-fence')
    expect(listener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['E074_AshTrees']
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
    ] as any
    player.cardStates = { E074_AshTrees: { counters: { fences: 2 } } }

    const result = executeCardListener(listener!, {
      state: createState([player]),
      player,
      space: createSpace('fence'),
      actionId: 'fence',
      phase: 'before',
    } as unknown as CardListenerContext)

    expect(result?.sourceCard).toBe('E074_AshTrees')
    expect(result?.flow?.type).toBe('xor')
    if (result?.flow?.type !== 'xor') return
    for (const child of result.flow.children) {
      expect(child).toMatchObject({ type: 'leaf', sourceCard: 'E074_AshTrees' })
    }
  })

  it('E53 Boar Spear tags exchange follow-up flow with sourceCard', () => {
    const obtainListener = findListener('E53-boar-spear-after-obtain')
    expect(obtainListener).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['E053_BoarSpear']
    // Seed an action snapshot token so the once-per-action guard sees a valid token
    player.cardStates = {
      ...(player.cardStates ?? {}),
      __actionSnapshot__: { extraData: { token: 1 } },
    }

    const actionEvents = [movedToPlayer({ boar: 2 }, player.id, { kind: 'actionSpace', spaceId: 'boar-market' })]
    const after = executeCardListener(obtainListener!, {
      state: createState([player]),
      player,
      space: createSpace('boar-market'),
      actionId: 'gain',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { boar: 2 } },
      transactionEvents: actionEvents,
      actionEvents,
    } as unknown as CardListenerContext)

    expect(after?.sourceCard).toBe('E053_BoarSpear')
    expect(after?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: 'E053_BoarSpear' },
        { type: 'leaf', actionId: 'exchange', optional: true, sourceCard: 'E053_BoarSpear' },
      ],
    })
  })

  it('D23 Pioneering Spirit card-owned choice options carry sourceCard', () => {
    const config = getPlayerActionSpaceConfig('D023_PioneeringSpirit')
    expect(config).toBeDefined()
    const player = createPlayer()
    const state = createState([player])
    state.round = 6

    const result = config!.createDefinition(player.id).execute({
      state,
      player,
      space: createSpace('D023_PioneeringSpirit'),
    } as unknown as ActionExecutionContext)

    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('choice')
    if (result.request.kind !== 'choice') return
    expect(result.request.options.map((option) => option.sourceCard)).toEqual([
      'D023_PioneeringSpirit',
      'D023_PioneeringSpirit',
      'D023_PioneeringSpirit',
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

    expect(first.type).toBe('request')
    if (first.type !== 'request') return
    expect(first.request.kind).toBe('choice')
    if (first.request.kind !== 'choice') return
    expect(first.request.options.every((option) => option.sourceCard === 'C104_Collector')).toBe(true)

    const retry = definition.resolveChoice?.({
      state,
      player,
      space: createSpace('C104_Collector'),
    } as any, 'wood,clay')
    expect(retry?.type).toBe('request')
    if (retry?.type !== 'request') return
    expect(retry.request.kind).toBe('choice')
    if (retry.request.kind !== 'choice') return
    expect(retry.request.options.every((option) => option.sourceCard === 'C104_Collector')).toBe(true)
  })

  it('B42 Forest Inn tags its xor exchange leaves with sourceCard', () => {
    const config = getPlayerActionSpaceConfig('B042_ForestInn')
    expect(config).toBeDefined()
    const player = createPlayer()
    player.minorPlayed = ['B042_ForestInn']
    player.resources.wood = 9
    const state = createState([player])

    const result = config!.createDefinition(player.id).execute({
      state,
      player,
      space: createSpace('B042_ForestInn'),
    } as unknown as ActionExecutionContext)

    expect(result.type).toBe('flow')
    if (result.type !== 'flow') return
    expect(result.flow.type).toBe('xor')
    if (result.flow.type !== 'xor') return
    expect(result.flow.children).toHaveLength(3)
    for (const child of result.flow.children) {
      expect(child.type).toBe('seq')
      if (child.type !== 'seq') return
      const [pay, gain] = child.children
      expect(pay?.type).toBe('leaf')
      expect(gain?.type).toBe('leaf')
      if (pay?.type !== 'leaf' || gain?.type !== 'leaf') return
      expect(pay.sourceCard).toBe('B042_ForestInn')
      expect(gain.sourceCard).toBe('B042_ForestInn')
    }
  })
})
