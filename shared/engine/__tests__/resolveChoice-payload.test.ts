import { beforeEach, describe, expect, it } from 'vitest'
import type {
  ActionDefinition,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../game/types'
import { ActionRegistry } from '../registry'
import { CardRegistry } from '../../cards/registry'
import { setActiveCardRegistry } from '../../cards/active-registry'
import { Engine } from '../engine'
import { EngineTree } from '../tree'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { ActionNode, InteractionNode, SequenceNode } from '../nodes'
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

const buildEngine = (action: ActionDefinition) => {
  const registry = new ActionRegistry()
  registry.register(action)
  const root = new SequenceNode(`sequence-${action.id}`, [
    new ActionNode(`action-${action.id}`, action.id),
    new InteractionNode(`choice-${action.id}`, []),
  ])
  return new Engine({
    tree: new EngineTree(root),
    registry,
    hooks: new HookDispatcher(),
    log: new LogStore(),
  })
}

describe('engine resolveChoice payload', () => {
  beforeEach(() => {
    clearActionHooks()
    setActiveCardRegistry(new CardRegistry())
  })

  it('threads payload to ActionDef.resolveChoice', () => {
    let receivedPayload: unknown = null
    const action: ActionDefinition = {
      id: 'payload-thread-action',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'request',
        request: { kind: 'choice', options: [{ value: 'confirm', labelKey: 'ok' }] },
        promptKey: 'test',
      }),
      resolveChoice: (_ctx, _choice, payload) => {
        receivedPayload = payload
        return { type: 'ok' }
      },
    }
    const engine = buildEngine(action)
    const state = createState()
    const player = createPlayer()
    const space = createSpace(action)
    engine.proceed({ state, player, space })
    engine.resolveChoice(
      'confirm',
      { state, player, space },
      { foo: 'bar' },
    )
    expect(receivedPayload).toEqual({ foo: 'bar' })
  })

  it('merges result.extraData.actionContextWrite into pendingInteractionContext.actionContext', () => {
    let callCount = 0
    const action: ActionDefinition = {
      id: 'merge-action',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'request',
        request: { kind: 'choice', options: [{ value: 'commit', labelKey: 'ok' }] },
        promptKey: 'test',
      }),
      resolveChoice: (_ctx, choice) => {
        callCount += 1
        if (choice === 'commit') {
          return {
            type: 'request',
            request: { kind: 'choice', options: [{ value: 'pay:wood3', labelKey: 'ok' }] },
            promptKey: 'pay',
            extraData: { actionContextWrite: { stashed: { foo: 42 } } },
          }
        }
        return { type: 'ok' }
      },
    }
    const engine = buildEngine(action)
    const state = createState()
    const player = createPlayer()
    const space = createSpace(action)
    engine.proceed({ state, player, space })
    engine.resolveChoice('commit', { state, player, space })
    // S4b PR5: read pending interaction context off the InteractionNode (host) directly.
    // S4c PR4: peekInteractionHost is `@internal` on Engine — package-internal test access.
    const host = engine.peekInteractionHost()
    const ctx = host instanceof InteractionNode ? host.contextSnapshot : undefined
    expect(ctx?.actionContext).toEqual({ stashed: { foo: 42 } })
    expect(callCount).toBe(1)
  })

  it('shallow-merges multiple actionContextWrite calls (later wins on key conflict)', () => {
    const action: ActionDefinition = {
      id: 'shallow-merge-action',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'request',
        request: { kind: 'choice', options: [{ value: 'a', labelKey: 'ok' }] },
        promptKey: 'test',
      }),
      resolveChoice: (_ctx, choice) => {
        if (choice === 'a') {
          return {
            type: 'request',
            request: { kind: 'choice', options: [{ value: 'b', labelKey: 'ok' }] },
            promptKey: 'b',
            extraData: { actionContextWrite: { x: 1, y: 2 } },
          }
        }
        if (choice === 'b') {
          return {
            type: 'request',
            request: { kind: 'choice', options: [{ value: 'c', labelKey: 'ok' }] },
            promptKey: 'c',
            extraData: { actionContextWrite: { y: 99, z: 3 } },
          }
        }
        return { type: 'ok' }
      },
    }
    const engine = buildEngine(action)
    const state = createState()
    const player = createPlayer()
    const space = createSpace(action)
    engine.proceed({ state, player, space })
    engine.resolveChoice('a', { state, player, space })
    engine.resolveChoice('b', { state, player, space })
    // S4b PR5: read pending interaction context off the InteractionNode (host) directly.
    // S4c PR4: peekInteractionHost is `@internal` on Engine — package-internal test access.
    const host = engine.peekInteractionHost()
    const ctx = host instanceof InteractionNode ? host.contextSnapshot : undefined
    expect(ctx?.actionContext).toEqual({ x: 1, y: 99, z: 3 })
  })
})
