import { beforeEach, describe, expect, it } from 'vitest'
import { ActionRegistry } from '../registry'
import { CardRegistry } from '../../cards/registry'
import { setActiveCardRegistry, requireActiveCardRegistry } from '../../cards/active-registry'
import { EngineTree } from '../tree'
import { Engine } from '../engine'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { ActionNode, OptionalNode } from '../nodes'
import { clearActionHooks } from '../../actions/hooks'
import { mkActionSpace } from '../../cards/__tests__/fixtures'

beforeEach(() => {
  clearActionHooks()
  setActiveCardRegistry(new CardRegistry())
})

describe('optional node active', () => {
  it('should not return blocked when active is true', () => {
    const minorAction = new ActionNode('action-minor', 'test-minor')
    const optionalNode = new OptionalNode('optional-minor', minorAction, 'ui.interactionOptionalAction')
    optionalNode.active = true // Set active to true
    const tree = new EngineTree(optionalNode)
    const registry = new ActionRegistry()
    registry.register({
      id: 'test-minor',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
    })
    const hooks = new HookDispatcher()
    const log = new LogStore()
    const engine = new Engine({ tree, registry, hooks, log })

    const step = engine.proceed({
      state: {
        round: 1,
        currentPlayerIndex: 0,
        players: [],
        actionSpaces: [],
        log: [],
        roundStartSnapshot: null,
        roundActionOrder: [],
        gameSeed: 1,
        availableMajorImprovements: [],
        futureMeeples: [],
        pendingFutureMeeples: [],
        gameOver: false,
      } as any,
      player: {
        id: 'p1',
        name: 'P1',
        color: 'red',
        resources: {
          wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
          grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
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
        occupationPlayed: [],houseAnimalType: null,
        houseAnimalCount: 0,
        stableAnimals: {},
        pastures: [],
        fenceSegments: [],
        majorEffects: { wellRounds: 0 },
        startPlayer: false,
        activeModifiers: [],
        cardStates: {},
      } as any,
      space: mkActionSpace({ id: 'noop' }),
    })
    expect(step.type).not.toBe('blocked')
  })
})
