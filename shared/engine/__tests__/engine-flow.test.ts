import { beforeEach, describe, expect, it } from 'vitest'
import type {
  ActionDefinition,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../game/types'
import { ActionRegistry } from '../registry'
import { Engine } from '../engine'
import { EngineTree } from '../tree'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import {
  ActionNode,
  ChoiceNode,
  OptionalNode,
  OrNode,
  ParallelNode,
  SequenceNode,
  XorNode,
} from '../nodes'
import { clearActionHooks, registerActionHook } from '../../actions/hooks'

const createState = () =>
  ({
    round: 1,
    currentPlayerIndex: 0,
    players: [],
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
  }) as GameState

const createPlayer = () =>
  ({
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
  }) as PlayerState

const createSpace = (action: ActionDefinition): ActionSpace => ({
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
  takenBy: null,
})

describe('Engine flow nodes', () => {
  beforeEach(() => {
    clearActionHooks()
  })

  it('or node removes completed choice and exposes done', () => {
    const buildRooms: ActionDefinition = {
      id: 'build-rooms',
      nameKey: 'actions.construct.name',
      descriptionKey: 'actions.construct.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'choice',
        promptKey: 'ui.interactionRoomSelect',
        options: [{ value: 'confirm', labelKey: 'ui.interactionRoomConfirm' }],
      }),
      resolveChoice: () => ({ type: 'ok' }),
    }
    const buildStables: ActionDefinition = {
      id: 'build-stables',
      nameKey: 'actions.stables.name',
      descriptionKey: 'actions.stables.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    }
    const registry = new ActionRegistry()
    registry.register(buildRooms)
    registry.register(buildStables)
    const roomsAction = new ActionNode('action-rooms', buildRooms.id)
    const roomsChoice = new ChoiceNode('choice-rooms', [])
    const roomsSeq = new SequenceNode('seq-rooms', [roomsAction, roomsChoice])
    const stablesAction = new ActionNode('action-stables', buildStables.id)
    const root = new OrNode('or-root', [roomsSeq, stablesAction])
    const engine = new Engine({
      tree: new EngineTree(root),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(buildRooms)
    const first = engine.proceed({ state, player, space })
    expect(first.type).toBe('choice')
    if (first.type !== 'choice') return
    const optionIds = first.choice.options.map((opt) => opt.value)
    expect(optionIds).toContain('seq-rooms')
    expect(optionIds).toContain('action-stables')
    const selectRooms = engine.resolveChoice('seq-rooms', { state, player, space })
    expect(selectRooms.type).toBe('choice')
    const confirm = engine.resolveChoice('confirm', { state, player, space })
    expect(confirm.type).toBe('ok')
    const next = engine.proceed({ state, player, space })
    expect(next.type).toBe('choice')
    if (next.type !== 'choice') return
    const nextIds = next.choice.options.map((opt) => opt.value)
    expect(nextIds).not.toContain('seq-rooms')
    expect(nextIds).toContain('action-stables')
    expect(nextIds).toContain('__done__')
  })

  it('xor node completes after one action', () => {
    const a: ActionDefinition = {
      id: 'a',
      nameKey: 'actions.bonus-wood.name',
      descriptionKey: 'actions.bonus-wood.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    }
    const b: ActionDefinition = {
      id: 'b',
      nameKey: 'actions.bonus-food.name',
      descriptionKey: 'actions.bonus-food.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    }
    const registry = new ActionRegistry()
    registry.register(a)
    registry.register(b)
    const root = new XorNode('xor-root', [
      new ActionNode('action-a', a.id),
      new ActionNode('action-b', b.id),
    ])
    const engine = new Engine({
      tree: new EngineTree(root),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(a)
    const first = engine.proceed({ state, player, space })
    expect(first.type).toBe('choice')
    if (first.type !== 'choice') return
    const choiceId = first.choice.options[0]?.value ?? 'action-a'
    engine.resolveChoice(choiceId, { state, player, space })
    const done = engine.proceed({ state, player, space })
    expect(done.type).toBe('done')
  })

  it('sequence node runs actions in order', () => {
    const a: ActionDefinition = {
      id: 'a',
      nameKey: 'actions.bonus-wood.name',
      descriptionKey: 'actions.bonus-wood.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    }
    const b: ActionDefinition = {
      id: 'b',
      nameKey: 'actions.bonus-food.name',
      descriptionKey: 'actions.bonus-food.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    }
    const registry = new ActionRegistry()
    registry.register(a)
    registry.register(b)
    const root = new SequenceNode('seq-root', [
      new ActionNode('action-a', a.id),
      new ActionNode('action-b', b.id),
    ])
    const engine = new Engine({
      tree: new EngineTree(root),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(a)
    expect(engine.proceed({ state, player, space }).type).toBe('ok')
    expect(engine.proceed({ state, player, space }).type).toBe('ok')
    expect(engine.proceed({ state, player, space }).type).toBe('done')
  })

  it('parallel node resolves after all children', () => {
    const a: ActionDefinition = {
      id: 'a',
      nameKey: 'actions.bonus-wood.name',
      descriptionKey: 'actions.bonus-wood.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    }
    const b: ActionDefinition = {
      id: 'b',
      nameKey: 'actions.bonus-food.name',
      descriptionKey: 'actions.bonus-food.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    }
    const registry = new ActionRegistry()
    registry.register(a)
    registry.register(b)
    const root = new ParallelNode('par-root', [
      new ActionNode('action-a', a.id),
      new ActionNode('action-b', b.id),
    ])
    const engine = new Engine({
      tree: new EngineTree(root),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(a)
    expect(engine.proceed({ state, player, space }).type).toBe('ok')
    expect(engine.proceed({ state, player, space }).type).toBe('ok')
    expect(engine.proceed({ state, player, space }).type).toBe('done')
  })

  it('computeReplace chain uses latest action id', () => {
    const events: string[] = []
    const a: ActionDefinition = {
      id: 'a',
      nameKey: 'actions.bonus-wood.name',
      descriptionKey: 'actions.bonus-wood.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('a')
        return { type: 'ok' }
      },
    }
    const b: ActionDefinition = {
      id: 'b',
      nameKey: 'actions.bonus-food.name',
      descriptionKey: 'actions.bonus-food.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('b')
        return { type: 'ok' }
      },
    }
    const c: ActionDefinition = {
      id: 'c',
      nameKey: 'actions.bonus-food.name',
      descriptionKey: 'actions.bonus-food.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('c')
        return { type: 'ok' }
      },
    }
    registerActionHook({
      id: 'replace-a-to-b',
      actions: ['a'],
      phases: ['computeReplace'],
      handler: () => ({ actionId: 'b' }),
    })
    registerActionHook({
      id: 'replace-b-to-c',
      actions: ['b'],
      phases: ['computeReplace'],
      handler: () => ({ actionId: 'c' }),
    })
    const registry = new ActionRegistry()
    registry.register(a)
    registry.register(b)
    registry.register(c)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('action-a', 'a')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(a)
    const result = engine.proceed({ state, player, space })
    expect(result.type).toBe('ok')
    expect(events).toEqual(['c'])
  })

  it('computeReplace chain stops when no further match', () => {
    const events: string[] = []
    const a: ActionDefinition = {
      id: 'a',
      nameKey: 'actions.bonus-wood.name',
      descriptionKey: 'actions.bonus-wood.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('a')
        return { type: 'ok' }
      },
    }
    const b: ActionDefinition = {
      id: 'b',
      nameKey: 'actions.bonus-food.name',
      descriptionKey: 'actions.bonus-food.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('b')
        return { type: 'ok' }
      },
    }
    registerActionHook({
      id: 'replace-a-to-b',
      actions: ['a'],
      phases: ['computeReplace'],
      handler: () => ({ actionId: 'b' }),
    })
    registerActionHook({
      id: 'replace-c-to-a',
      actions: ['c'],
      phases: ['computeReplace'],
      handler: () => ({ actionId: 'a' }),
    })
    const registry = new ActionRegistry()
    registry.register(a)
    registry.register(b)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('action-a', 'a')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(a)
    const result = engine.proceed({ state, player, space })
    expect(result.type).toBe('ok')
    expect(events).toEqual(['b'])
  })

  it('computeReplace and isDoable stay consistent', () => {
    const a: ActionDefinition = {
      id: 'a',
      nameKey: 'actions.bonus-wood.name',
      descriptionKey: 'actions.bonus-wood.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    }
    const blocked: ActionDefinition = {
      id: 'blocked',
      nameKey: 'actions.bonus-food.name',
      descriptionKey: 'actions.bonus-food.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => false,
      execute: () => ({ type: 'ok' }),
    }
    registerActionHook({
      id: 'replace-a-to-blocked',
      actions: ['a'],
      phases: ['computeReplace'],
      handler: () => ({ actionId: 'blocked' }),
    })
    const registry = new ActionRegistry()
    registry.register(a)
    registry.register(blocked)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('action-a', 'a')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(a)
    const result = engine.proceed({ state, player, space })
    expect(result.type).toBe('blocked')
  })

  it('optional node auto-skips when child is not doable', () => {
    const action: ActionDefinition = {
      id: 'blocked-action',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => false,
      execute: () => ({ type: 'ok' }),
    }
    const registry = new ActionRegistry()
    registry.register(action)
    const optional = new OptionalNode(
      'opt',
      new ActionNode('action-blocked', 'blocked-action'),
      'ui.interactionOptionalAction',
    )
    const engine = new Engine({
      tree: new EngineTree(optional),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(action)

    const step = engine.proceed({ state, player, space })
    expect(step.type).toBe('ok')
    expect(optional.getState()).toBe('resolved')
  })

  it('optional node resolves when choosing __skip__', () => {
    const action: ActionDefinition = {
      id: 'skippable',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    }
    const registry = new ActionRegistry()
    registry.register(action)
    const optional = new OptionalNode(
      'opt',
      new ActionNode('action-skip', 'skippable'),
      'ui.interactionOptionalAction',
    )
    const engine = new Engine({
      tree: new EngineTree(optional),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(action)

    const step = engine.proceed({ state, player, space })
    expect(step.type).toBe('choice')

    const result = engine.resolveChoice('__skip__', { state, player, space })
    expect(result.type).toBe('ok')
    expect(optional.getState()).toBe('resolved')

    const done = engine.proceed({ state, player, space })
    expect(done.type).toBe('done')
  })

  it('or node resolves when choosing __done__', () => {
    const a: ActionDefinition = {
      id: 'or-a',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    }
    const b: ActionDefinition = {
      id: 'or-b',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    }
    const registry = new ActionRegistry()
    registry.register(a)
    registry.register(b)
    const root = new OrNode('or', [
      new ActionNode('action-a', 'or-a'),
      new ActionNode('action-b', 'or-b'),
    ])
    const engine = new Engine({
      tree: new EngineTree(root),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(a)

    const first = engine.proceed({ state, player, space })
    expect(first.type).toBe('choice')
    engine.resolveChoice('action-a', { state, player, space })

    const second = engine.proceed({ state, player, space })
    expect(second.type).toBe('choice')
    if (second.type !== 'choice') return
    expect(second.choice.options.map((o) => o.value)).toContain('__done__')

    engine.resolveChoice('__done__', { state, player, space })
    const done = engine.proceed({ state, player, space })
    expect(done.type).toBe('done')
  })
})
