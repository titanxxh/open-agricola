import { beforeEach, describe, expect, it } from 'vitest'
import type {
  ActionDefinition,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../../game/types'
import { ActionRegistry } from '../../../engine/registry'
import { Engine } from '../../../engine/engine'
import { EngineTree } from '../../../engine/tree'
import { HookDispatcher } from '../../../engine/dispatcher'
import { LogStore } from '../../../engine/log-store'
import { ActionNode, ChoiceNode, SequenceNode } from '../../../engine/nodes'
import { clearActionHooks } from '../../../actions/hooks'
import { registerCardListener } from '../../registry-ops'
import { registerStubCards, clearStubCards } from '../index'
import { CARD_ID as IMMEDIATELY_AFTER_ID } from '../Stub_ImmediatelyAfter_GainFlow'
import { CARD_ID as COMPUTE_COSTS_ID } from '../Stub_ComputeCosts_BuildDiscount'
import { CARD_ID as AFTER_GAIN_ID } from '../Stub_After_GainFlow'
import { CARD_ID as COMPUTE_ARGS_ID } from '../Stub_ComputeArgs_ExtraOption'
import { CARD_ID as IS_DOABLE_ID } from '../Stub_IsDoable_Override'
import { CARD_ID as ON_RETURN_HOME_ID } from '../Stub_OnReturnHome_Accumulate'
import { CARD_ID as SCOPE_OPPONENT_ID } from '../Stub_Scope_Opponent'
import { CARD_A as ORDER_LOW_ID, CARD_B as ORDER_HIGH_ID } from '../Stub_Order_Priority'
import { runReturnHomeHooks } from '../../card-effects'
import { internalActionDefinitions } from '../../../actions/internal-actions'
import { getFenceCount } from '../../../actions/effects/fencing'

const gainAction = internalActionDefinitions.find(a => a.id === 'gain')!
const markCardObservedAction = internalActionDefinitions.find(a => a.id === 'mark-card-observed')!

const runToCompletion = (engine: Engine, context: { state: GameState; player: PlayerState; space: ActionSpace }) => {
  let step = engine.proceed(context)
  while (step.type === 'ok') {
    step = engine.proceed(context)
  }
  return step
}

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id,
    name,
    color: id === 'p1' ? 'red' : 'blue',
    resources: {
      wood: 5, clay: 5, reed: 5, stone: 5, food: 5,
      grain: 5, vegetable: 5, sheep: 0, boar: 0, cattle: 0, begging: 0,
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
    roomTiles: [],
    stableTiles: [],
    improvements: [],
    minorHand: [],
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [],houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as PlayerState

const makeCollectAction = (): ActionDefinition => ({
  id: 'collect',
  nameKey: 'actions.collect.name',
  descriptionKey: 'actions.collect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, space }) => {
    const res = space.resources;
    (['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle'] as const).forEach((key) => {
      if (res[key] > 0) {
        player.resources[key] += res[key]
        res[key] = 0
      }
    })
    return { type: 'ok' }
  },
})

const makeBuildRoomAction = (): ActionDefinition => ({
  id: 'construct',
  nameKey: 'actions.buildRoom.name',
  descriptionKey: 'actions.buildRoom.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: (ctx) => {
    const woodCost = 5 + (ctx.costs?.wood ?? 0)
    const reedCost = 2 + (ctx.costs?.reed ?? 0)
    if (ctx.player.resources.wood < woodCost || ctx.player.resources.reed < reedCost) {
      return { type: 'fail', logKey: 'log.buildRoomFail' }
    }
    ctx.player.resources.wood -= woodCost
    ctx.player.resources.reed -= reedCost
    ctx.player.rooms += 1
    return { type: 'ok' }
  },
})

const makeDayLaborerAction = (): ActionDefinition => ({
  id: 'day-laborer',
  nameKey: 'actions.dayLaborer.name',
  descriptionKey: 'actions.dayLaborer.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    player.resources.food += 2
    return { type: 'ok' }
  },
})

const makeImprovementAnyAction = (): ActionDefinition => ({
  id: 'improvement-any',
  nameKey: 'actions.improvementAny.name',
  descriptionKey: 'actions.improvementAny.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({
    type: 'choice',
    promptKey: 'ui.selectImprovement',
    options: [{ value: 'major-a', labelKey: 'Major A' }],
  }),
  resolveChoice: () => ({ type: 'ok' }),
})

const makePlowAction = (): ActionDefinition => ({
  id: 'plow',
  nameKey: 'actions.plow.name',
  descriptionKey: 'actions.plow.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    player.fields.push({ x: 0, y: player.fields.length, crop: null, amount: 0 })
    return { type: 'ok' }
  },
})

const createSpace = (action: ActionDefinition, spaceId?: string): ActionSpace => ({
  ...action,
  id: spaceId ?? action.id,
  resources: {
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
    grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
  },
  takenBy: [],
})

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 1,
    currentPlayerIndex: 0,
    players,
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: [],
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as GameState

const buildEngine = (action: ActionDefinition) => {
  const registry = new ActionRegistry()
  registry.register(action)
  if (gainAction && action.id !== 'gain') {
    registry.register(gainAction)
  }
  return (spaceId?: string) => {
    const log = new LogStore()
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', action.id)),
      registry,
      hooks: new HookDispatcher(),
      log,
    })
    return { engine, log, space: createSpace(action, spaceId) }
  }
}

describe('Stub card: Stub_ImmediatelyAfter_GainFlow', () => {
  beforeEach(() => {
    clearActionHooks()
    clearStubCards()
    registerStubCards()
  })

  it('triggers on common-forest collect and records counter', () => {
    const player = createPlayer()
    player.minorPlayed = [IMMEDIATELY_AFTER_ID]
    const action = makeCollectAction()
    const { engine, space } = buildEngine(action)('common-forest')
    space.resources.wood = 3
    const state = createState(player)

    runToCompletion(engine, { state, player, space })

    expect(player.resources.wood).toBe(5 + 3 + 1)
    expect(player.cardStates[IMMEDIATELY_AFTER_ID]?.counters?.observedCount).toBe(1)
  })

  it('does not trigger on non-forest collect', () => {
    const player = createPlayer()
    player.minorPlayed = [IMMEDIATELY_AFTER_ID]
    const action = makeCollectAction()
    const { engine, space } = buildEngine(action)('common-clay-pit')
    space.resources.clay = 2
    const state = createState(player)

    engine.proceed({ state, player, space })

    expect(player.cardStates[IMMEDIATELY_AFTER_ID]).toBeUndefined()
  })
})

describe('Stub card: Stub_ComputeCosts_BuildDiscount', () => {
  beforeEach(() => {
    clearActionHooks()
    clearStubCards()
    registerStubCards()
  })

  it('reduces build-room wood cost by 1', () => {
    const player = createPlayer()
    player.minorPlayed = [COMPUTE_COSTS_ID]
    player.resources.wood = 5
    player.resources.reed = 2
    const action = makeBuildRoomAction()
    const { engine, space } = buildEngine(action)()
    const state = createState(player)

    engine.proceed({ state, player, space })

    expect(player.rooms).toBe(3)
    expect(player.resources.wood).toBe(1)
    expect(player.cardStates[COMPUTE_COSTS_ID]?.counters?.observedCount).toBe(1)
  })

  it('does not trigger on non-build actions', () => {
    const player = createPlayer()
    player.minorPlayed = [COMPUTE_COSTS_ID]
    const action = makeCollectAction()
    const { engine, space } = buildEngine(action)('common-forest')
    space.resources.wood = 1
    const state = createState(player)

    engine.proceed({ state, player, space })

    expect(player.cardStates[COMPUTE_COSTS_ID]).toBeUndefined()
  })
})

describe('Stub card: Stub_After_GainFlow', () => {
  beforeEach(() => {
    clearActionHooks()
    clearStubCards()
    registerStubCards()
  })

  it('triggers on sheep market collect', () => {
    const player = createPlayer()
    player.minorPlayed = [AFTER_GAIN_ID]
    const action = makeCollectAction()
    const { engine, space } = buildEngine(action)('round-sheep-market')
    space.resources.sheep = 1
    const state = createState(player)

    runToCompletion(engine, { state, player, space })

    expect(player.resources.sheep).toBe(1)
    expect(player.resources.food).toBe(5 + 1)
    expect(player.cardStates[AFTER_GAIN_ID]?.counters?.observedCount).toBe(1)
  })

  it('does not trigger on non-sheep-market collect', () => {
    const player = createPlayer()
    player.minorPlayed = [AFTER_GAIN_ID]
    const action = makeCollectAction()
    const { engine, space } = buildEngine(action)('common-forest')
    space.resources.wood = 1
    const state = createState(player)

    engine.proceed({ state, player, space })

    expect(player.cardStates[AFTER_GAIN_ID]).toBeUndefined()
  })
})

describe('Stub card: Stub_ComputeArgs_ExtraOption', () => {
  beforeEach(() => {
    clearActionHooks()
    clearStubCards()
    registerStubCards()
  })

  it('adds extra option to improvement-any choice', () => {
    const player = createPlayer()
    player.minorPlayed = [COMPUTE_ARGS_ID]
    const action = makeImprovementAnyAction()
    const registry = new ActionRegistry()
    registry.register(action)
    const log = new LogStore()
    const engine = new Engine({
      tree: new EngineTree(
        new SequenceNode('seq', [
          new ActionNode('a', 'improvement-any'),
          new ChoiceNode('c', []),
        ]),
      ),
      registry,
      hooks: new HookDispatcher(),
      log,
    })
    const space = createSpace(action)
    const state = createState(player)

    const step = engine.proceed({ state, player, space })
    expect(step.type).toBe('choice')
    if (step.type !== 'choice') return
    const values = step.choice.options.map((o) => o.value)
    expect(values).toContain('stub-bonus-improvement')
    expect(player.cardStates[COMPUTE_ARGS_ID]?.counters?.observedCount).toBe(1)
  })
})

describe('Stub card: Stub_IsDoable_Override', () => {
  beforeEach(() => {
    clearActionHooks()
    clearStubCards()
    registerStubCards()
  })

  it('allows using occupied day-laborer with card', () => {
    const player = createPlayer()
    player.minorPlayed = [IS_DOABLE_ID]
    const action: ActionDefinition = {
      ...makeDayLaborerAction(),
      canBeExecutedByPlayer: () => false,
    }
    const { engine, space } = buildEngine(action)()
    const state = createState(player)

    const result = engine.proceed({ state, player, space })

    expect(result.type).toBe('ok')
    expect(player.cardStates[IS_DOABLE_ID]?.counters?.observedCount).toBeGreaterThanOrEqual(1)
  })

  it('does not override for player without card', () => {
    const player = createPlayer()
    const action: ActionDefinition = {
      ...makeDayLaborerAction(),
      canBeExecutedByPlayer: () => false,
    }
    const { engine, space } = buildEngine(action)()
    const state = createState(player)

    const result = engine.proceed({ state, player, space })

    expect(result.type).toBe('blocked')
  })
})

describe('Stub card: Stub_OnReturnHome_Accumulate', () => {
  beforeEach(() => {
    clearActionHooks()
    clearStubCards()
    registerStubCards()
  })

  it('accumulates grain counter each return home call', () => {
    const player = createPlayer()
    player.minorPlayed = [ON_RETURN_HOME_ID]
    const state = createState(player)

    runReturnHomeHooks(state, player)
    runReturnHomeHooks(state, player)
    runReturnHomeHooks(state, player)

    expect(player.cardStates[ON_RETURN_HOME_ID]?.counters?.observedCount).toBe(3)
    expect(player.cardStates[ON_RETURN_HOME_ID]?.counters?.grain).toBe(3)
  })

  it('does not trigger for player without card', () => {
    const player = createPlayer()
    const state = createState(player)

    runReturnHomeHooks(state, player)

    expect(player.cardStates[ON_RETURN_HOME_ID]).toBeUndefined()
  })
})

describe('Stub card: Stub_Scope_Opponent', () => {
  beforeEach(() => {
    clearActionHooks()
    clearStubCards()
    registerStubCards()
  })

  it('triggers when opponent collects (p1 has card, p2 collects)', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.minorPlayed = [SCOPE_OPPONENT_ID]
    const p2 = createPlayer('p2', 'P2')
    const action = makeCollectAction()
    const { engine, log, space } = buildEngine(action)('common-forest')
    space.resources.wood = 1
    const state = createState(p1, p2)

    runToCompletion(engine, { state, player: p2, space })

    expect(p1.cardStates[SCOPE_OPPONENT_ID]?.counters?.observedCount).toBe(1)
    expect(p1.resources.food).toBe(6)
    expect(p2.cardStates[SCOPE_OPPONENT_ID]?.counters?.observedCount).toBeUndefined()
  })

  it('does not trigger when card owner collects', () => {
    const p1 = createPlayer('p1', 'P1')
    p1.minorPlayed = [SCOPE_OPPONENT_ID]
    const p2 = createPlayer('p2', 'P2')
    const action = makeCollectAction()
    const { engine, space } = buildEngine(action)('common-forest')
    space.resources.wood = 1
    const state = createState(p1, p2)

    engine.proceed({ state, player: p1, space })

    expect(p1.cardStates[SCOPE_OPPONENT_ID]).toBeUndefined()
    expect(p1.resources.food).toBe(5)
  })
})

describe('Stub card: Stub_Order_Priority', () => {
  beforeEach(() => {
    clearActionHooks()
    clearStubCards()
    registerStubCards()
  })

  it('executes low-order card before high-order card', () => {
    const triggerOrder: string[] = []
    clearStubCards()

    registerCardListener({
      id: 'stub-order-low',
      cardIds: [ORDER_LOW_ID],
      phases: ['immediatelyAfter'],
      actions: ['collect'],
      order: 10,
      handler: (context) => {
        if (!context.player.minorPlayed.includes(ORDER_LOW_ID)) return
        triggerOrder.push('low')
        return {}
      },
    })

    registerCardListener({
      id: 'stub-order-high',
      cardIds: [ORDER_HIGH_ID],
      phases: ['immediatelyAfter'],
      actions: ['collect'],
      order: 20,
      handler: (context) => {
        if (!context.player.minorPlayed.includes(ORDER_HIGH_ID)) return
        triggerOrder.push('high')
        return {}
      },
    })

    const player = createPlayer()
    player.minorPlayed = [ORDER_LOW_ID, ORDER_HIGH_ID]
    const action = makeCollectAction()
    const { engine, space } = buildEngine(action)('common-forest')
    space.resources.wood = 1
    const state = createState(player)

    runToCompletion(engine, { state, player, space })

    expect(triggerOrder).toEqual(['low', 'high'])
  })
})

describe('Stub card: Stub_AfterAction_OptionalConstruct', () => {
  const OPTIONAL_CONSTRUCT_ID = 'Stub_AfterAction_OptionalConstruct'

  beforeEach(() => {
    clearActionHooks()
    clearStubCards()
    registerStubCards()
  })

  it('creates optional construct flow after plow', () => {
    const player = createPlayer()
    player.minorPlayed = [OPTIONAL_CONSTRUCT_ID]
    player.resources.wood = 20
    player.resources.reed = 10
    const plowAction = makePlowAction()
    const constructAction = makeBuildRoomAction()
    const registry = new ActionRegistry()
    registry.register(plowAction)
    registry.register(constructAction)
    if (gainAction) registry.register(gainAction)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', 'plow')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const space = createSpace(plowAction)
    const state = createState(player)

    const steps: string[] = []
    let step = engine.proceed({ state, player, space })
    steps.push(step.type)
    let safety = 0
    while (step.type === 'ok' && safety < 20) {
      step = engine.proceed({ state, player, space })
      steps.push(step.type)
      safety++
    }
    expect(steps).toContain('choice')
    expect(player.cardStates?.[OPTIONAL_CONSTRUCT_ID]?.counters?.observedCount).toBe(1)
  })

  it('skip optional construct completes the flow', () => {
    const player = createPlayer()
    player.minorPlayed = [OPTIONAL_CONSTRUCT_ID]
    const plowAction = makePlowAction()
    const constructAction = makeBuildRoomAction()
    const registry = new ActionRegistry()
    registry.register(plowAction)
    registry.register(constructAction)
    if (gainAction) registry.register(gainAction)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', 'plow')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const space = createSpace(plowAction)
    const state = createState(player)

    let step = engine.proceed({ state, player, space })
    while (step.type === 'ok') {
      step = engine.proceed({ state, player, space })
    }
    if (step.type !== 'choice') return
    const result = engine.resolveChoice('__skip__', { state, player, space })
    expect(result.type).toBe('ok')

    const final = engine.proceed({ state, player, space })
    expect(final.type).toBe('done')
  })
})

describe('Stub card: Stub_CardStorage_ConsumeFence', () => {
  const STORAGE_ID = 'Stub_CardStorage_ConsumeFence'

  beforeEach(() => {
    clearActionHooks()
    clearStubCards()
    registerStubCards()
  })

  it('consumes stored fence and reduces wood cost', () => {
    const player = createPlayer()
    player.minorPlayed = [STORAGE_ID]
    player.cardStates = { [STORAGE_ID]: { counters: { fences: 5 } } }
    player.resources.wood = 10

    const fenceAction: ActionDefinition = {
      id: 'fence',
      nameKey: 'actions.fence.name',
      descriptionKey: 'actions.fence.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: (ctx) => {
        const woodCost = 1 + (ctx.costs?.wood ?? 0)
        ctx.player.resources.wood -= Math.max(0, woodCost)
        ctx.player.fenceSegments.push({ edge: `__hookcov_${ctx.player.fenceSegments.length}`, type: 'fence' })
        return { type: 'ok' }
      },
    }
    const registry = new ActionRegistry()
    registry.register(fenceAction)
    if (gainAction) registry.register(gainAction)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', 'fence')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const space = createSpace(fenceAction)
    const state = createState(player)

    runToCompletion(engine, { state, player, space })

    expect(player.cardStates[STORAGE_ID]?.counters?.fences).toBe(4)
    expect(player.cardStates[STORAGE_ID]?.counters?.observedCount).toBe(1)
    expect(getFenceCount(player)).toBe(1)
    // Cost was 1 wood, but discount of -1 makes effective cost 0
    expect(player.resources.wood).toBe(10)
  })

  it('does not consume when no fences stored', () => {
    const player = createPlayer()
    player.minorPlayed = [STORAGE_ID]
    player.cardStates = { [STORAGE_ID]: { counters: { fences: 0 } } }
    player.resources.wood = 10

    const fenceAction: ActionDefinition = {
      id: 'fence',
      nameKey: 'actions.fence.name',
      descriptionKey: 'actions.fence.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: (ctx) => {
        const woodCost = 1 + (ctx.costs?.wood ?? 0)
        ctx.player.resources.wood -= Math.max(0, woodCost)
        ctx.player.fenceSegments.push({ edge: `__hookcov_${ctx.player.fenceSegments.length}`, type: 'fence' })
        return { type: 'ok' }
      },
    }
    const registry = new ActionRegistry()
    registry.register(fenceAction)
    if (gainAction) registry.register(gainAction)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', 'fence')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const space = createSpace(fenceAction)
    const state = createState(player)

    runToCompletion(engine, { state, player, space })

    expect(player.cardStates[STORAGE_ID]?.counters?.fences).toBe(0)
    expect(player.resources.wood).toBe(9)
  })
})

describe('Stub card: Stub_ComputeReplace_Decline', () => {
  const DECLINE_ID = 'Stub_ComputeReplace_Decline'

  beforeEach(() => {
    clearActionHooks()
    clearStubCards()
    registerStubCards()
  })

  it('declines sow by offering xor and can execute the alternative gain flow', () => {
    const player = createPlayer()
    player.minorPlayed = [DECLINE_ID]
    player.resources.food = 0

    const sowAction: ActionDefinition = {
      id: 'sow',
      nameKey: 'actions.sow.name',
      descriptionKey: 'actions.sow.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: ({ player: p }) => {
        p.fields.push({ x: 0, y: 0, crop: 'grain', amount: 3 })
        return { type: 'ok' }
      },
    }
    const registry = new ActionRegistry()
    registry.register(sowAction)
    if (gainAction) registry.register(gainAction)
    if (markCardObservedAction) registry.register(markCardObservedAction)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', 'sow')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const space = createSpace(sowAction)
    const state = createState(player)

    const originalFieldCount = player.fields.length
    const step = runToCompletion(engine, { state, player, space })
    expect(step.type).toBe('choice')
    if (step.type !== 'choice') return

    const gainOption = step.choice.options.find((option) => option.labelKey === 'actions.gain.name')
    expect(gainOption).toBeDefined()

    const result = engine.resolveChoice(gainOption!.value, { state, player, space })
    expect(result.type).toBe('ok')
    const completion = runToCompletion(engine, { state, player, space })
    expect(completion.type).toBe('done')

    expect(player.fields.length).toBe(originalFieldCount)
    expect(player.resources.food).toBe(1)
    expect(player.cardStates?.[DECLINE_ID]?.counters?.observedCount).toBe(1)
  })

  it('does not decline when card not played', () => {
    const player = createPlayer()
    player.resources.food = 0

    const sowAction: ActionDefinition = {
      id: 'sow',
      nameKey: 'actions.sow.name',
      descriptionKey: 'actions.sow.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: ({ player: p }) => {
        p.fields.push({ x: 0, y: 0, crop: 'grain', amount: 3 })
        return { type: 'ok' }
      },
    }
    const registry = new ActionRegistry()
    registry.register(sowAction)
    if (gainAction) registry.register(gainAction)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', 'sow')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const space = createSpace(sowAction)
    const state = createState(player)

    runToCompletion(engine, { state, player, space })

    expect(player.fields.length).toBe(1)
    expect(player.resources.food).toBe(0)
  })
})
