import { beforeEach, describe, expect, it } from 'vitest'
import type {
  ActionDefinition,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../contract/types'
import { clearActionHooks, registerActionHook } from '../../actions/hooks'
import { CardRegistry } from '../../cards/registry'
import { setActiveCardRegistry } from '../../cards/active-registry'
import { HookDispatcher } from '../dispatcher'
import { Engine } from '../engine'
import { LogStore } from '../log-store'
import { ActionNode } from '../nodes'
import { ActionRegistry } from '../registry'
import { EngineTree } from '../tree'

const createState = (): GameState =>
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

const createPlayer = (): PlayerState =>
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
    roomTiles: [],
    stableTiles: [],
    improvements: [],
    minorHand: [],
    minorPlayed: [],
    occupationHand: [],
    occupationPlayed: [],
    extraOccupationsFromCards: [],
    playedCards: [],
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

describe('Engine immediate logs', () => {
  beforeEach(() => {
    clearActionHooks()
    setActiveCardRegistry(new CardRegistry())
  })

  it('deduplicates legacy logKey when the same immediate log is also provided', () => {
    const main: ActionDefinition = {
      id: 'main',
      nameKey: 'test.main',
      descriptionKey: 'test.main.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'ok',
        logKey: 'log.mainImmediate',
        logParams: { source: 'action-result' },
        immediateLogs: [
          {
            key: 'log.mainImmediate',
            params: { source: 'action-result' },
          },
        ],
      }),
    }

    registerActionHook({
      id: 'main-after-log-dedupe',
      actions: ['main'],
      phases: ['after'],
      handler: () => ({
        logKey: 'log.afterHook',
        logParams: { source: 'after-hook' },
        immediateLogs: [
          {
            key: 'log.afterHook',
            params: { source: 'after-hook' },
          },
        ],
      }),
    })

    const registry = new ActionRegistry()
    registry.register(main)
    const log = new LogStore()
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('main-node', 'main')),
      registry,
      hooks: new HookDispatcher(),
      log,
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(main)

    const result = engine.proceed({ state, player, space })
    expect(result.type).toBe('ok')
    expect(log.all()).toEqual([
      {
        key: 'log.afterHook',
        params: { player: 'P1', source: 'after-hook' },
      },
      {
        key: 'log.mainImmediate',
        params: { player: 'P1', source: 'action-result' },
      },
    ])
  })

  it('appends action and hook immediate logs before follow-up flow executes', () => {
    const executed: string[] = []
    const main: ActionDefinition = {
      id: 'main',
      nameKey: 'test.main',
      descriptionKey: 'test.main.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        executed.push('main')
        return {
          type: 'flow',
          flow: { type: 'leaf', actionId: 'follow-up' },
          immediateLogs: [
            {
              key: 'log.mainImmediate',
              params: { source: 'action-result' },
            },
          ],
        }
      },
    }
    const followUp: ActionDefinition = {
      id: 'follow-up',
      nameKey: 'test.followUp',
      descriptionKey: 'test.followUp.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        executed.push('follow-up')
        return {
          type: 'ok',
          logKey: 'log.followUp',
          logParams: { source: 'flow-node' },
        }
      },
    }

    registerActionHook({
      id: 'main-immediately-after-log',
      actions: ['main'],
      phases: ['immediatelyAfter'],
      handler: () => ({
        immediateLogs: [
          {
            key: 'log.immediatelyAfterHook',
            params: { source: 'immediatelyAfter-hook' },
          },
        ],
      }),
    })
    registerActionHook({
      id: 'main-after-log',
      actions: ['main'],
      phases: ['after'],
      handler: () => ({
        immediateLogs: [
          {
            key: 'log.afterHook',
            params: { source: 'after-hook' },
          },
        ],
      }),
    })

    const registry = new ActionRegistry()
    registry.register(main)
    registry.register(followUp)
    const log = new LogStore()
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('main-node', 'main')),
      registry,
      hooks: new HookDispatcher(),
      log,
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(main)

    const first = engine.proceed({ state, player, space })
    expect(first.type).toBe('ok')
    expect(executed).toEqual(['main'])
    expect(log.all()).toEqual(
      expect.arrayContaining([
        {
          key: 'log.mainImmediate',
          params: { player: 'P1', source: 'action-result' },
        },
        {
          key: 'log.immediatelyAfterHook',
          params: { player: 'P1', source: 'immediatelyAfter-hook' },
        },
        {
          key: 'log.afterHook',
          params: { player: 'P1', source: 'after-hook' },
        },
      ]),
    )

    const firstKeys = log.all().map((entry) => entry.key)
    expect(firstKeys.indexOf('log.afterHook')).toBeLessThan(
      firstKeys.indexOf('log.immediatelyAfterHook'),
    )
    expect(firstKeys.indexOf('log.immediatelyAfterHook')).toBeLessThan(
      firstKeys.indexOf('log.mainImmediate'),
    )

    const second = engine.proceed({ state, player, space })
    expect(second.type).toBe('ok')
    expect(executed).toEqual(['main', 'follow-up'])
    expect(log.all()[0]).toEqual({
      key: 'log.followUp',
      params: { player: 'P1', source: 'flow-node' },
    })
  })

  it('deduplicates legacy flow logKey when the same immediate log is also provided', () => {
    const executed: string[] = []
    const main: ActionDefinition = {
      id: 'main',
      nameKey: 'test.main',
      descriptionKey: 'test.main.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'flow',
        flow: { type: 'leaf', actionId: 'follow-up' },
        logKey: 'log.mainImmediate',
        logParams: { source: 'flow-action' },
        immediateLogs: [
          {
            key: 'log.mainImmediate',
            params: { source: 'flow-action' },
          },
        ],
      }),
    }
    const followUp: ActionDefinition = {
      id: 'follow-up',
      nameKey: 'test.followUp',
      descriptionKey: 'test.followUp.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => {
        executed.push('follow-up')
        return {
          type: 'ok',
          logKey: 'log.followUp',
        }
      },
    }

    const registry = new ActionRegistry()
    registry.register(main)
    registry.register(followUp)
    const log = new LogStore()
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('main-node', 'main')),
      registry,
      hooks: new HookDispatcher(),
      log,
    })
    const state = createState()
    const player = createPlayer()
    const space = createSpace(main)

    const first = engine.proceed({ state, player, space })
    expect(first.type).toBe('ok')
    expect(log.all().filter((entry) => entry.key === 'log.mainImmediate')).toEqual([
      {
        key: 'log.mainImmediate',
        params: { player: 'P1', source: 'flow-action' },
      },
    ])

    const second = engine.proceed({ state, player, space })
    expect(second.type).toBe('ok')
    expect(executed).toEqual(['follow-up'])
  })
})
