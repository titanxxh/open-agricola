import { beforeEach, describe, expect, it } from 'vitest'
import type {
  ActionDefinition,
  ActionSpace,
  ChoiceDescriptionPreview,
  GameState,
  PlayerState,
} from '../../contract/types'
import { payAction } from '../../actions/effects/pay'
import { gainAction } from '../../actions/effects/gain'
import { bonusVpAction } from '../../actions/effects/bonus-vp'
import { ActionRegistry } from '../registry'
import { CardRegistry } from '../../cards/registry'
import { setActiveCardRegistry, requireActiveCardRegistry } from '../../cards/active-registry'
import { Engine } from '../engine'
import { EngineTree } from '../tree'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import {
  ActionNode,
  InteractionNode,
  OptionalNode,
  OrNode,
  ParallelNode,
  SequenceNode,
  XorNode,
} from '../nodes'
import { clearActionHooks, registerActionHook } from '../../actions/hooks'
import { buildPhaseTrailingNodes } from '../engine-utils'
import type { CardListenerContext, MatchedCardListener } from '../../cards/card-listeners'

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
    occupationPlayed: [],houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
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
  takenBy: [],
})

describe('Engine flow nodes', () => {
  beforeEach(() => {
    clearActionHooks()
  setActiveCardRegistry(new CardRegistry())
  })

  it('dynamic result.flow targetPlayerId scopes only the targeted subtree', () => {
    const p1 = createPlayer()
    const p2 = { ...createPlayer(), id: 'p2', name: 'P2', color: 'blue' as const }
    const state = createState()
    state.players = [p1, p2]

    const triggerAction: ActionDefinition = {
      id: 'trigger-target-flow',
      nameKey: 'test.trigger',
      descriptionKey: 'test.trigger',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'flow',
        flow: {
          type: 'seq',
          children: [
            {
              type: 'leaf',
              actionId: 'gain',
              params: { food: 1 },
              targetPlayerId: p2.id,
            },
            {
              type: 'leaf',
              actionId: 'gain',
              params: { wood: 1 },
            },
          ],
        },
      }),
    }
    const registry = new ActionRegistry()
    registry.register(triggerAction)
    registry.register(gainAction)
    const space = createSpace(triggerAction)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('trigger', triggerAction.id)),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })

    const playerForNextNode = () => {
      const nodeId = engine.peekNextUnresolvedNodeId()
      const ownerId = nodeId ? engine.getEffectiveOwnerPlayerId(nodeId, p1.id) : p1.id
      return state.players.find((player) => player.id === ownerId) ?? p1
    }

    let step = engine.proceed({ state, player: playerForNextNode(), space })
    let safety = 20
    while (safety-- > 0 && step.type === 'ok') {
      step = engine.proceed({ state, player: playerForNextNode(), space })
    }

    expect(p2.resources.food).toBe(1)
    expect(p2.resources.wood).toBe(0)
    expect(p1.resources.wood).toBe(1)
  })

  it('phase trailing listener activation is emitted as an internal action leaf', () => {
    const p1 = createPlayer()
    const p2 = { ...createPlayer(), id: 'p2', name: 'P2', color: 'blue' as const }
    const state = createState()
    state.players = [p1, p2]

    const registry = new ActionRegistry()
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('trigger', 'gain')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const matched: MatchedCardListener[] = [
      {
        registration: {
          id: 'listener-1',
          cardIds: ['C1'],
          mandatory: true,
          handler: () => undefined,
        },
        cardId: 'C1',
        ownerPlayerId: p1.id,
      },
    ]

    const nodes = buildPhaseTrailingNodes(
      engine._internals(),
      matched,
      'after',
      'gain',
      state,
      { foo: 'bar' },
      p2.id,
    )

    expect(nodes).toHaveLength(1)
    const node = nodes[0]
    expect(node).toBeInstanceOf(ActionNode)
    const actionNode = node as ActionNode
    expect(actionNode.actionId).toBe('activate-card')
    expect(actionNode.sourceCard).toBe('C1')
    expect(actionNode.ownerPlayerId).toBe(p1.id)
    expect(actionNode.params).toMatchObject({
      listenerId: 'listener-1',
      cardId: 'C1',
      phase: 'after',
      actionId: 'gain',
      event: { foo: 'bar' },
      ownerPlayerId: p1.id,
      triggerPlayerId: p2.id,
      mandatory: true,
    })
  })

  it('during listener activation preserves original trigger player for cross-owner listeners', () => {
    const p1 = createPlayer()
    const p2 = { ...createPlayer(), id: 'p2', name: 'P2', color: 'blue' as const }
    p2.minorPlayed = ['CROSS_DURING_CARD']
    const state = createState()
    state.players = [p1, p2]

    const seen: Array<{
      playerId?: string
      triggerPlayerId?: string
      ownerPlayerId?: string
      mandatory?: unknown
    }> = []
    const cardRegistry = new CardRegistry()
    cardRegistry.registerListener({
      id: 'cross-owner-during',
      cardIds: ['CROSS_DURING_CARD'],
      actions: ['trigger-cross-owner-during'],
      phases: ['during'],
      scope: 'any',
      mandatory: true,
      handler: (context: CardListenerContext) => {
        seen.push({
          playerId: context.player.id,
          triggerPlayerId: context.triggerPlayer?.id,
          ownerPlayerId: context.ownerPlayer?.id,
          mandatory: (context as CardListenerContext & { mandatory?: unknown }).mandatory,
        })
        return { logKey: 'log.testCrossOwnerDuring' }
      },
    })
    setActiveCardRegistry(cardRegistry)

    const triggerAction: ActionDefinition = {
      id: 'trigger-cross-owner-during',
      nameKey: 'test.crossOwnerDuring',
      descriptionKey: 'test.crossOwnerDuring',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    }
    const registry = new ActionRegistry()
    registry.register(triggerAction)
    const space = createSpace(triggerAction)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('trigger', triggerAction.id)),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const playerForNextNode = () => {
      const nodeId = engine.peekNextUnresolvedNodeId()
      const ownerId = nodeId ? engine.getEffectiveOwnerPlayerId(nodeId, p1.id) : p1.id
      return state.players.find((player) => player.id === ownerId) ?? p1
    }

    let step = engine.proceed({ state, player: playerForNextNode(), space })
    let safety = 10
    while (safety-- > 0 && step.type === 'ok') {
      step = engine.proceed({ state, player: playerForNextNode(), space })
    }

    expect(seen).toEqual([
      {
        playerId: p1.id,
        triggerPlayerId: p1.id,
        ownerPlayerId: p2.id,
        mandatory: true,
      },
    ])
  })

  it('dynamic result.flow nested targetPlayerId preserves inner owner override', () => {
    const p1 = createPlayer()
    const p2 = { ...createPlayer(), id: 'p2', name: 'P2', color: 'blue' as const }
    const state = createState()
    state.players = [p1, p2]

    const triggerAction: ActionDefinition = {
      id: 'trigger-nested-target-flow',
      nameKey: 'test.triggerNested',
      descriptionKey: 'test.triggerNested',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'flow',
        flow: {
          type: 'seq',
          targetPlayerId: p2.id,
          children: [
            {
              type: 'leaf',
              actionId: 'gain',
              params: { food: 1 },
            },
            {
              type: 'leaf',
              actionId: 'gain',
              params: { wood: 1 },
              targetPlayerId: p1.id,
            },
          ],
        },
      }),
    }
    const registry = new ActionRegistry()
    registry.register(triggerAction)
    registry.register(gainAction)
    const space = createSpace(triggerAction)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('trigger', triggerAction.id)),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })

    const playerForNextNode = () => {
      const nodeId = engine.peekNextUnresolvedNodeId()
      const ownerId = nodeId ? engine.getEffectiveOwnerPlayerId(nodeId, p1.id) : p1.id
      return state.players.find((player) => player.id === ownerId) ?? p1
    }

    let step = engine.proceed({ state, player: playerForNextNode(), space })
    let safety = 20
    while (safety-- > 0 && step.type === 'ok') {
      step = engine.proceed({ state, player: playerForNextNode(), space })
    }

    expect(p2.resources.food).toBe(1)
    expect(p2.resources.wood).toBe(0)
    expect(p1.resources.wood).toBe(1)
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
        type: 'request',
        request: { kind: 'choice', options: [{ value: 'confirm', labelKey: 'ui.interactionRoomConfirm' }] },
        promptKey: 'ui.interactionRoomSelect',
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
    const roomsChoice = new InteractionNode('choice-rooms', [])
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
    expect(selectRooms.type).toBe('request')
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

  it('xor node completes after a nested choice action resolves', () => {
    const plow: ActionDefinition = {
      id: 'plow',
      nameKey: 'actions.plow.name',
      descriptionKey: 'actions.plow.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'request',
        request: { kind: 'choice', options: [{ value: 'confirm', labelKey: 'ui.interactionPlowConfirm' }] },
        promptKey: 'ui.interactionPlowSelect',
      }),
      resolveChoice: () => ({ type: 'ok' }),
    }
    const skip: ActionDefinition = {
      id: 'skip',
      nameKey: 'actions.set-first-player.name',
      descriptionKey: 'actions.set-first-player.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    }
    const registry = new ActionRegistry()
    registry.register(plow)
    registry.register(skip)
    const plowSeq = new SequenceNode('seq-plow', [
      new ActionNode('action-plow', plow.id),
      new InteractionNode('choice-plow', []),
    ])
    const root = new XorNode('xor-root', [
      plowSeq,
      new ActionNode('action-skip', skip.id),
    ])
    const engine = new Engine({
      tree: new EngineTree(root),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(plow)

    const first = engine.proceed({ state, player, space })
    expect(first.type).toBe('choice')
    if (first.type !== 'choice') return

    const choosePlow = engine.resolveChoice('seq-plow', { state, player, space })
    expect(choosePlow.type).toBe('request')

    const confirm = engine.resolveChoice('confirm', { state, player, space })
    expect(confirm.type).toBe('ok')

    const done = engine.proceed({ state, player, space })
    expect(done.type).toBe('done')
  })

  it('xor node prefers custom choice labels from flow leaves', () => {
    const a: ActionDefinition = {
      id: 'a',
      nameKey: 'actions.bonus-wood.name',
      descriptionKey: 'actions.bonus-wood.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    }
    const registry = new ActionRegistry()
    registry.register(a)
    const root = new XorNode('xor-root', [
      new ActionNode('action-a', a.id, undefined, undefined, 'ui.customChoice', { count: 2 }),
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
    expect(first.choice.options[0]).toMatchObject({
      value: 'action-a',
      labelKey: 'ui.customChoice',
      labelParams: { count: 2 },
      descriptionPreview: {
        kind: 'action',
        labelKey: 'ui.customChoice',
        labelParams: { count: 2 },
      },
    })
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

  it('computeReplace decline offers xor between replacement and original action', () => {
    const events: string[] = []
    const original: ActionDefinition = {
      id: 'original',
      nameKey: 'actions.construct.name',
      descriptionKey: 'actions.construct.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('original')
        return { type: 'ok' }
      },
    }
    const replacement: ActionDefinition = {
      id: 'replacement',
      nameKey: 'actions.place-farmer.name',
      descriptionKey: 'actions.place-farmer.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        events.push('replacement')
        return { type: 'ok' }
      },
    }
    requireActiveCardRegistry('engine-flow').registerListener({
      id: 'offer-replacement',
      actions: ['original'],
      phases: ['computeReplace'],
      handler: (hookContext) => {
        if (hookContext.actionContext?.checkedReplaceAction === true) return
        return {
          decline: true,
          alternativeFlow: {
            type: 'leaf',
            actionId: 'replacement',
            choiceLabelKey: 'ui.interactionLazySowmanPlace',
          },
        }
      },
    })
    const registry = new ActionRegistry()
    registry.register(original)
    registry.register(replacement)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('action-original', 'original')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(original)

    expect(engine.proceed({ state, player, space }).type).toBe('ok')
    const choiceStep = engine.proceed({ state, player, space })
    expect(choiceStep.type).toBe('choice')
    if (choiceStep.type !== 'choice') return
    expect(choiceStep.choice.options.map((option) => option.labelKey)).toEqual([
      'ui.interactionLazySowmanPlace',
      'actions.construct.name',
    ])

    const originalOption = choiceStep.choice.options.find(
      (option) => option.labelKey === 'actions.construct.name',
    )
    expect(originalOption).toBeDefined()

    const result = engine.resolveChoice(originalOption!.value, { state, player, space })
    expect(result.type).toBe('ok')
    expect(events).toEqual(['original'])
  })

  it('or choices show action-or-replace when computeReplace is available', () => {
    const plow: ActionDefinition = {
      id: 'plow',
      nameKey: 'actions.plow.name',
      descriptionKey: 'actions.plow.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    }
    const sow: ActionDefinition = {
      id: 'sow',
      nameKey: 'actions.sow.name',
      descriptionKey: 'actions.sow.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    }
    requireActiveCardRegistry('engine-flow').registerListener({
      id: 'offer-sow-replacement',
      actions: ['sow'],
      phases: ['computeReplace'],
      handler: (hookContext) => {
        if (hookContext.actionContext?.checkedReplaceAction === true) return
        return {
          decline: true,
          alternativeFlow: {
            type: 'leaf',
            actionId: 'plow',
            choiceLabelKey: 'ui.interactionUseCard',
            choiceLabelParams: { cardNameKey: 'occupations.A94_LazySowman.name' },
          },
        }
      },
    })
    const registry = new ActionRegistry()
    registry.register(plow)
    registry.register(sow)
    const engine = new Engine({
      tree: new EngineTree(new OrNode('root-or', [
        new ActionNode('action-plow', 'plow'),
        new ActionNode('action-sow', 'sow'),
      ], 'ui.interactionCultivationSelect')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(sow)

    const step = engine.proceed({ state, player, space })
    expect(step.type).toBe('choice')
    if (step.type !== 'choice') return
    expect(step.choice.options.map((option) => option.labelKey)).toEqual([
      'actions.plow.name',
      'ui.interactionActionOrReplace',
    ])
    const sowOption = step.choice.options.find((option) => option.labelKey === 'ui.interactionActionOrReplace')
    expect(sowOption?.labelParams).toEqual({ actionNameKey: 'actions.sow.name' })
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

  const collectDescriptionLabelKeys = (preview: ChoiceDescriptionPreview | undefined): string[] => {
    if (!preview) return []
    if (preview.kind === 'action') return [preview.labelKey]
    return preview.parts.flatMap(collectDescriptionLabelKeys)
  }

  it('xor of pure gain branches: options use action nameKeys not ui.interactionResourceExchange', () => {
    const registry = new ActionRegistry()
    registry.register(payAction)
    registry.register(gainAction)
    const root = new XorNode('xor-gains', [
      new ActionNode('gain-wood', 'gain', 'E126_TaxCollector', { wood: 2 }),
      new ActionNode('gain-clay', 'gain', 'E126_TaxCollector', { clay: 2 }),
    ])
    const engine = new Engine({
      tree: new EngineTree(root),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(gainAction)
    const first = engine.proceed({ state, player, space })
    expect(first.type).toBe('choice')
    if (first.type !== 'choice') return
    for (const opt of first.choice.options) {
      expect(opt.labelKey).not.toBe('ui.interactionResourceExchange')
      expect(collectDescriptionLabelKeys(opt.descriptionPreview)).toEqual(['actions.gain.name'])
    }
  })

  it('xor of pay-then-gain sequences: descriptionPreview groups pay and gain', () => {
    const registry = new ActionRegistry()
    registry.register(payAction)
    registry.register(gainAction)
    const root = new XorNode('xor-studio', [
      new SequenceNode('seq-wood', [
        new ActionNode('pay-w', 'pay', 'C55_Studio', { wood: 1 }),
        new ActionNode('gain-w', 'gain', 'C55_Studio', { food: 2 }),
      ]),
      new SequenceNode('seq-clay', [
        new ActionNode('pay-c', 'pay', 'C55_Studio', { clay: 1 }),
        new ActionNode('gain-c', 'gain', 'C55_Studio', { food: 2 }),
      ]),
    ])
    const engine = new Engine({
      tree: new EngineTree(root),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    player.resources.wood = 2
    player.resources.clay = 2
    const space = createSpace(payAction)
    const first = engine.proceed({ state, player, space })
    expect(first.type).toBe('choice')
    if (first.type !== 'choice') return
    for (const opt of first.choice.options) {
      expect(opt.labelKey).not.toBe('ui.interactionResourceExchange')
      expect(collectDescriptionLabelKeys(opt.descriptionPreview)).toEqual([
        'actions.pay.name',
        'actions.gain.name',
      ])
    }
  })

  it('xor of pay-then-bonus-vp vs pay-then-gain: descriptionPreview reflects each branch', () => {
    const registry = new ActionRegistry()
    registry.register(payAction)
    registry.register(gainAction)
    registry.register(bonusVpAction)
    const root = new XorNode('xor-paint', [
      new SequenceNode('seq-food', [
        new ActionNode('pay-f', 'pay', 'E39_Paintbrush', { clay: 1 }),
        new ActionNode('gain-f', 'gain', 'E39_Paintbrush', { food: 2 }),
      ]),
      new SequenceNode('seq-vp', [
        new ActionNode('pay-v', 'pay', 'E39_Paintbrush', { clay: 1 }),
        new ActionNode('bv', 'bonus-vp', 'E39_Paintbrush'),
      ]),
    ])
    const engine = new Engine({
      tree: new EngineTree(root),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    player.resources.clay = 2
    const space = createSpace(payAction)
    const first = engine.proceed({ state, player, space })
    expect(first.type).toBe('choice')
    if (first.type !== 'choice') return
    const byValue = Object.fromEntries(first.choice.options.map((o) => [o.value, o]))
    const foodBranch = byValue['seq-food']
    const vpBranch = byValue['seq-vp']
    expect(foodBranch).toBeDefined()
    expect(vpBranch).toBeDefined()
    expect(foodBranch!.labelKey).not.toBe('ui.interactionResourceExchange')
    expect(vpBranch!.labelKey).not.toBe('ui.interactionResourceExchange')
    expect(collectDescriptionLabelKeys(foodBranch!.descriptionPreview)).toEqual([
      'actions.pay.name',
      'actions.gain.name',
    ])
    expect(collectDescriptionLabelKeys(vpBranch!.descriptionPreview)).toEqual([
      'actions.pay.name',
      'actions.bonus-vp.name',
    ])
  })
})
