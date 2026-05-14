import { beforeEach, describe, it, expect } from 'vitest'
import type {
  ActionDefinition,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../contract/types'
import { ActionRegistry } from '../registry'
import { CardRegistry } from '../../cards/registry'
import { setActiveCardRegistry, requireActiveCardRegistry } from '../../cards/active-registry'
import { Engine } from '../engine'
import { EngineTree } from '../tree'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { ActionNode, SequenceNode } from '../nodes'
import { clearActionHooks } from '../../actions/hooks'

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

const buildEngine = (action: ActionDefinition, withChoice: boolean) => {
  const registry = new ActionRegistry()
  registry.register(action)
  const root = withChoice
    ? new SequenceNode(`sequence-${action.id}`, [
        new ActionNode(`action-${action.id}`, action.id),
      ])
    : new ActionNode(`action-${action.id}`, action.id)
  return new Engine({
    tree: new EngineTree(root),
    registry,
    hooks: new HookDispatcher(),
    log: new LogStore(),
  })
}

describe('Engine tree flow', () => {
  beforeEach(() => {
    clearActionHooks()
    setActiveCardRegistry(new CardRegistry())
  })

  it('handles action with choice and resolves to done', () => {
    const action: ActionDefinition = {
      id: 'choice-action',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'request',
        request: { kind: 'choice', options: [{ value: 'a', labelKey: 'a' }] },
        promptKey: 'choose',
      }),
      resolveChoice: () => ({ type: 'ok' }),
    }
    const engine = buildEngine(action, true)
    const state = createState()
    const player = createPlayer()
    const space = createSpace(action)
    const step = engine.proceed({
      state,
      player,
      space,
    })
    expect(step.type).toBe('choice')
    const result = engine.resolveChoice('a', {
      state,
      player,
      space,
    })
    expect(result.type).toBe('ok')
    const done = engine.proceed({
      state,
      player,
      space,
    })
    expect(done.type).toBe('done')
  })

  it('rejects invalid finite values for ActionNode pending choices', () => {
    let resolveCount = 0
    const action: ActionDefinition = {
      id: 'choice-action',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'request',
        request: { kind: 'choice', options: [{ value: 'a', labelKey: 'a' }] },
        promptKey: 'choose',
      }),
      resolveChoice: () => {
        resolveCount += 1
        return { type: 'ok' }
      },
    }
    const engine = buildEngine(action, true)
    const state = createState()
    const player = createPlayer()
    const space = createSpace(action)
    engine.proceed({ state, player, space })

    const result = engine.resolveChoice('not-a-choice', {
      state,
      player,
      space,
    })

    expect(result.type).toBe('fail')
    expect(resolveCount).toBe(0)
    expect(engine.peekPendingEnvelope()?.request.kind).toBe('choice')
  })

  it('handles action without choice', () => {
    const action: ActionDefinition = {
      id: 'simple-action',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    }
    const engine = buildEngine(action, false)
    const state = createState()
    const player = createPlayer()
    const space = createSpace(action)
    const step = engine.proceed({
      state,
      player,
      space,
    })
    expect(step.type).toBe('ok')
    const done = engine.proceed({
      state,
      player,
      space,
    })
    expect(done.type).toBe('done')
  })

  it('does not re-execute a ready action node while it hosts pending metadata', () => {
    let executeCount = 0
    const action: ActionDefinition = {
      id: 'pending-action',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        executeCount += 1
        return { type: 'ok' }
      },
    }
    const registry = new ActionRegistry()
    registry.register(action)
    const node = new ActionNode('action-pending', action.id)
    node.setPending({
      hostNodeId: node.id,
      request: { kind: 'choice', options: [{ value: 'resume', labelKey: 'ui.resume' }] },
      choices: [{ value: 'resume', labelKey: 'ui.resume' }],
      promptKey: 'ui.interactionFlowSelect',
    })
    const engine = new Engine({
      tree: new EngineTree(node),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(action)

    const step = engine.proceed({ state, player, space })

    expect(step).toEqual({
      type: 'choice',
      nodeId: 'action-pending',
      choice: {
        promptKey: 'ui.interactionFlowSelect',
        promptParams: undefined,
        options: [{ value: 'resume', labelKey: 'ui.resume' }],
      },
    })
    expect(executeCount).toBe(0)
  })

  it('restores pending metadata and does not re-execute the restored host node', () => {
    let executeCount = 0
    const action: ActionDefinition = {
      id: 'restore-pending-action',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        executeCount += 1
        return { type: 'ok' }
      },
    }
    const registry = new ActionRegistry()
    registry.register(action)
    const node = new ActionNode('action-restore-pending', action.id)
    node.setPending({
      hostNodeId: node.id,
      request: { kind: 'choice', options: [{ value: 'resume', labelKey: 'ui.resume' }] },
      choices: [{ value: 'resume', labelKey: 'ui.resume' }],
      promptKey: 'ui.interactionFlowSelect',
      effectiveOwnerPlayerId: 'p1',
    })
    const original = new Engine({
      tree: new EngineTree(node),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const restored = new Engine({
      tree: new EngineTree(new ActionNode('action-restore-pending', action.id)),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    restored.restore(original.snapshot())
    const state = createState()
    const player = createPlayer()
    const space = createSpace(action)

    expect(restored.peekPendingEnvelope()).toMatchObject({
      hostNodeId: 'action-restore-pending',
      promptKey: 'ui.interactionFlowSelect',
      effectiveOwnerPlayerId: 'p1',
    })
    const step = restored.proceed({ state, player, space })

    expect(step).toEqual({
      type: 'choice',
      nodeId: 'action-restore-pending',
      choice: {
        promptKey: 'ui.interactionFlowSelect',
        promptParams: undefined,
        options: [{ value: 'resume', labelKey: 'ui.resume' }],
      },
    })
    expect(executeCount).toBe(0)
  })
})
