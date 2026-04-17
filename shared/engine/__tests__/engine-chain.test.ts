import { describe, expect, it, beforeEach } from 'vitest'
import { ActionRegistry } from '../registry'
import { ActionNode, ChoiceNode, OptionalNode, OrNode, SequenceNode, XorNode } from '../nodes'
import { Engine } from '../engine'
import { EngineTree } from '../tree'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { actionDefinitions } from '../../actions'
import { internalActionDefinitions } from '../../actions/internal-actions'
import type { ActionSpace, GameState, PlayerState } from '../../game/types'
import { clearActionHooks, registerActionHook } from '../../actions/hooks'
import { clearCardListeners } from '../../cards/card-listeners'

const createPlayer = (): PlayerState => ({
  id: 'p1',
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
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
})

const createSpace = (id: string): ActionSpace => {
  const action = actionDefinitions.find((item) => item.id === id)
  if (!action) {
    throw new Error('Action not found')
  }
  return {
    ...action,
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
  }
}

const createState = (space: ActionSpace, player: PlayerState): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players: [player],
  actionSpaces: [space],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: [],
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
})

describe('engine follow-up actions', () => {
  beforeEach(() => {
    clearActionHooks()
    clearCardListeners()
  })

  it('inserts follow-up actions after hooks', () => {
    registerActionHook({
      id: 'after-day-laborer-bonus',
      actions: ['day-laborer'],
      phases: ['after'],
      handler: () => ({ followUpActions: ['bonus-wood'] }),
    })

    const registry = new ActionRegistry()
    actionDefinitions.forEach((action) => registry.register(action))
    internalActionDefinitions.forEach((action) => registry.register(action))
    const hooks = new HookDispatcher()
    const log = new LogStore()
    const tree = new EngineTree(new ActionNode('action-day-laborer', 'day-laborer'))
    const engine = new Engine({ tree, registry, hooks, log })
    const player = createPlayer()
    const space = createSpace('day-laborer')
    const state = createState(space, player)

    const first = engine.proceed({ state, player, space })
    expect(first.type).toBe('ok')
    expect(player.resources.food).toBe(2)

    const second = engine.proceed({ state, player, space })
    expect(second.type).toBe('ok')
    expect(player.resources.wood).toBe(1)
  })

  it('keeps tree shape when parent is or node', () => {
    const actionA = {
      id: 'test-a',
      nameKey: 'actions.bonus-wood.name',
      descriptionKey: 'actions.bonus-wood.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' as const }),
    }
    const actionB = {
      ...actionA,
      id: 'test-b',
    }
    const actionC = {
      ...actionA,
      id: 'test-c',
    }
    registerActionHook({
      id: 'after-test-a',
      actions: ['test-a'],
      phases: ['after'],
      handler: () => ({ followUpActions: ['test-c'] }),
    })
    const registry = new ActionRegistry()
    registry.register(actionA)
    registry.register(actionB)
    registry.register(actionC)
    const root = new OrNode('or-root', [
      new ActionNode('action-a', 'test-a'),
      new ActionNode('action-b', 'test-b'),
    ])
    const tree = new EngineTree(root)
    const engine = new Engine({
      tree,
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const player = createPlayer()
    const space = createSpace('day-laborer')
    const state = createState(space, player)

    const first = engine.proceed({ state, player, space })
    expect(first.type).toBe('choice')
    if (first.type !== 'choice') return
    engine.resolveChoice('action-a', { state, player, space })

    expect(tree.root).toBe(root)
    expect(root.children).toHaveLength(2)
    expect(root.children[0]).toBeInstanceOf(SequenceNode)
    const wrapped = root.children[0] as SequenceNode
    expect(wrapped.children.map((node) => node.id)).toEqual(['action-a', 'chain-action-a-0'])
  })

  it('keeps tree shape when parent is optional node', () => {
    const actionA = {
      id: 'optional-a',
      nameKey: 'actions.bonus-wood.name',
      descriptionKey: 'actions.bonus-wood.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' as const }),
    }
    const actionB = {
      ...actionA,
      id: 'optional-b',
    }
    registerActionHook({
      id: 'after-optional-a',
      actions: ['optional-a'],
      phases: ['after'],
      handler: () => ({ followUpActions: ['optional-b'] }),
    })
    const registry = new ActionRegistry()
    registry.register(actionA)
    registry.register(actionB)
    const optional = new OptionalNode(
      'optional-root',
      new ActionNode('action-optional-a', 'optional-a'),
      'ui.interactionOptionalAction',
    )
    optional.active = true
    const tree = new EngineTree(optional)
    const engine = new Engine({
      tree,
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const player = createPlayer()
    const space = createSpace('day-laborer')
    const state = createState(space, player)

    const first = engine.proceed({ state, player, space })
    expect(first.type).toBe('ok')
    expect(tree.root).toBe(optional)
    expect(optional.child).toBeInstanceOf(SequenceNode)
    const wrapped = optional.child as SequenceNode
    expect(wrapped.children.map((node) => node.id)).toEqual([
      'action-optional-a',
      'chain-action-optional-a-0',
    ])
  })

  it('wraps root as sequence only for root insertion', () => {
    const actionA = {
      id: 'root-a',
      nameKey: 'actions.bonus-wood.name',
      descriptionKey: 'actions.bonus-wood.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' as const }),
    }
    const actionB = {
      ...actionA,
      id: 'root-b',
    }
    registerActionHook({
      id: 'after-root-a',
      actions: ['root-a'],
      phases: ['after'],
      handler: () => ({ followUpActions: ['root-b'] }),
    })
    const registry = new ActionRegistry()
    registry.register(actionA)
    registry.register(actionB)
    const root = new ActionNode('root-action', 'root-a')
    const tree = new EngineTree(root)
    const engine = new Engine({
      tree,
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const player = createPlayer()
    const space = createSpace('day-laborer')
    const state = createState(space, player)

    const first = engine.proceed({ state, player, space })
    expect(first.type).toBe('ok')
    expect(tree.root).toBeInstanceOf(SequenceNode)
  })

  it('hook returning flow field inserts and executes flow node', () => {
    const executed: string[] = []
    const mainAction = {
      id: 'flow-main',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        executed.push('flow-main')
        return { type: 'ok' as const }
      },
    }
    const bonusAction = {
      id: 'flow-bonus',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        executed.push('flow-bonus')
        return { type: 'ok' as const }
      },
    }

    registerActionHook({
      id: 'after-flow-main',
      actions: ['flow-main'],
      phases: ['after'],
      handler: () => ({
        flow: { type: 'leaf' as const, actionId: 'flow-bonus' },
      }),
    })

    const registry = new ActionRegistry()
    registry.register(mainAction)
    registry.register(bonusAction)
    const tree = new EngineTree(new ActionNode('action-main', 'flow-main'))
    const engine = new Engine({
      tree,
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const player = createPlayer()
    const space = createSpace('day-laborer')
    const state = createState(space, player)

    engine.proceed({ state, player, space })
    const second = engine.proceed({ state, player, space })
    expect(second.type).toBe('ok')
    expect(executed).toEqual(['flow-main', 'flow-bonus'])
    expect(engine.proceed({ state, player, space }).type).toBe('done')
  })

  it('resolveChoice action path inserts flow nodes from after hooks', () => {
    const executed: string[] = []
    const mainAction = {
      id: 'resolve-flow-main',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'choice' as const,
        promptKey: 'choose',
        options: [{ value: 'opt-a', labelKey: 'A' }],
      }),
      resolveChoice: () => {
        executed.push('resolveChoice')
        return { type: 'ok' as const }
      },
    }
    const bonusAction = {
      id: 'resolve-flow-bonus',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        executed.push('bonus')
        return { type: 'ok' as const }
      },
    }

    registerActionHook({
      id: 'after-resolve-flow',
      actions: ['resolve-flow-main'],
      phases: ['after'],
      handler: () => ({
        flow: { type: 'leaf' as const, actionId: 'resolve-flow-bonus' },
      }),
    })

    const registry = new ActionRegistry()
    registry.register(mainAction)
    registry.register(bonusAction)
    const tree = new EngineTree(
      new SequenceNode('seq', [
        new ActionNode('action-main', 'resolve-flow-main'),
        new ChoiceNode('choice-main', []),
      ]),
    )
    const engine = new Engine({
      tree,
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const player = createPlayer()
    const space = createSpace('day-laborer')
    const state = createState(space, player)

    const step = engine.proceed({ state, player, space })
    expect(step.type).toBe('choice')

    engine.resolveChoice('opt-a', { state, player, space })

    const bonus = engine.proceed({ state, player, space })
    expect(bonus.type).toBe('ok')
    expect(executed).toContain('bonus')
  })
})
