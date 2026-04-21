import { describe, expect, it, beforeEach } from 'vitest'
import { ActionRegistry } from '../registry'
import { ActionNode, SequenceNode, XorNode } from '../nodes'
import { Engine } from '../engine'
import { EngineTree } from '../tree'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { actionDefinitions } from '../../actions'
import { internalActionDefinitions } from '../../actions/internal-actions'
import type { ActionSpace, GameState, PlayerState } from '../../game/types'
import { clearActionHooks, registerActionHook } from '../../actions/hooks'
import { clearCardListeners, registerCardListener } from '../../cards/registry-ops'
import type { CardListenerContext } from '../../cards/card-listeners'

const createPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
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
  occupationPlayed: [],houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  ...overrides,
})

const createSpace = (id: string, overrides: Partial<ActionSpace> = {}): ActionSpace => {
  const action = actionDefinitions.find((item) => item.id === id)
  if (!action) {
    throw new Error(`Action not found: ${id}`)
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
    ...overrides,
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

describe('Collect action card listeners integration', () => {
  beforeEach(() => {
    clearActionHooks()
    clearCardListeners()
  })

  it('E53_BoarSpear: registers during listener for collect action', () => {
    const boarSpearListener = {
      id: 'E53-boar-spear-during',
      phases: ['during' as const],
      actions: ['collect'],
      handler: (context: CardListenerContext) => {
        const obtainedBoar = context.result?.resourcesGained?.boar ?? 0
        if (obtainedBoar <= 0) return
        
        return {
          flow: {
            type: 'xor' as const,
            children: [
              { type: 'leaf' as const, actionId: 'exchange', optional: true },
            ],
          },
        }
      },
    }
    registerCardListener(boarSpearListener)

    const registry = new ActionRegistry()
    actionDefinitions.forEach((action) => registry.register(action))
    internalActionDefinitions.forEach((action) => registry.register(action))
    
    const hooks = new HookDispatcher()
    const log = new LogStore()
    
    const tree = new EngineTree(new ActionNode('action-collect', 'collect'))
    const engine = new Engine({ tree, registry, hooks, log })
    
    const player = createPlayer()
    const space = createSpace('sheep-market', { resources: { sheep: 2, boar: 0, cattle: 0, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, begging: 0 } })
    const state = createState(space, player)

    const result = engine.proceed({ state, player, space })
    
    expect(result.type).toBe('ok')
  })

  it('A108_MushroomCollector: registers immediatelyAfter listener for collect action', () => {
    const mushroomCollectorListener = {
      id: 'A108-mushroom-collector-immediately-after',
      phases: ['immediatelyAfter' as const],
      actions: ['collect'],
      handler: () => ({
        flow: {
          type: 'xor' as const,
          children: [
            { type: 'leaf' as const, actionId: 'exchange', optional: true },
          ],
        },
      }),
    }
    registerCardListener(mushroomCollectorListener)

    const registry = new ActionRegistry()
    actionDefinitions.forEach((action) => registry.register(action))
    internalActionDefinitions.forEach((action) => registry.register(action))
    
    const hooks = new HookDispatcher()
    const log = new LogStore()
    
    const tree = new EngineTree(new ActionNode('action-collect', 'collect'))
    const engine = new Engine({ tree, registry, hooks, log })
    
    const player = createPlayer()
    const space = createSpace('forest', { resources: { wood: 3, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 } })
    const state = createState(space, player)

    const result = engine.proceed({ state, player, space })
    expect(result.type).toBe('ok')
    expect(player.resources.wood).toBe(3)
  })

  it('A17_ReclamationPlow: registers after listener for collect action', () => {
    const reclamationPlowListener = {
      id: 'A17-reclamation-plow-after',
      phases: ['after' as const],
      actions: ['collect'],
      handler: () => ({
        flow: {
          type: 'xor' as const,
          children: [
            { type: 'leaf' as const, actionId: 'plow', optional: true },
          ],
        },
      }),
    }
    registerCardListener(reclamationPlowListener)

    const registry = new ActionRegistry()
    actionDefinitions.forEach((action) => registry.register(action))
    internalActionDefinitions.forEach((action) => registry.register(action))
    
    const hooks = new HookDispatcher()
    const log = new LogStore()
    
    const tree = new EngineTree(new ActionNode('action-collect', 'collect'))
    const engine = new Engine({ tree, registry, hooks, log })
    
    const player = createPlayer({
      houseAnimalType: 'sheep',
      houseAnimalCount: 1,
      rooms: 2,
    })
    const space = createSpace('sheep-market', { resources: { sheep: 1, boar: 0, cattle: 0, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, begging: 0 } })
    const state = createState(space, player)

    const result = engine.proceed({ state, player, space })
    expect(result.type).toBe('ok')
    expect(player.resources.sheep).toBe(1)
  })

  it('card listener does not trigger for non-collect actions', () => {
    const boarSpearListener = {
      id: 'E53-boar-spear-during',
      phases: ['during' as const],
      actions: ['collect'],
      handler: () => ({
        flow: {
          type: 'xor' as const,
          children: [
            { type: 'leaf' as const, actionId: 'exchange', optional: true },
          ],
        },
      }),
    }
    registerCardListener(boarSpearListener)

    const registry = new ActionRegistry()
    actionDefinitions.forEach((action) => registry.register(action))
    internalActionDefinitions.forEach((action) => registry.register(action))
    
    const hooks = new HookDispatcher()
    const log = new LogStore()
    
    const tree = new EngineTree(new ActionNode('action-gain', 'gain'))
    const engine = new Engine({ tree, registry, hooks, log })
    
    const player = createPlayer()
    const space = createSpace('day-laborer')
    const state = createState(space, player)

    const result = engine.proceed({ state, player, space })
    
    expect(result.type).toBe('ok')
    expect(player.resources.food).toBe(2)
  })

  it('A53_Claypipe: tracks building resources gained during gain action', () => {
    const claypipeListener = {
      id: 'A53-claypipe-immediately-after',
      phases: ['immediatelyAfter' as const],
      actions: ['gain'],
      handler: (context: CardListenerContext) => {
        const { player, result } = context
        
        if (!player.minorPlayed?.includes('A53_Claypipe')) return
        if (result?.type !== 'ok') return
        
        const gainedResources = result.resourcesGained ?? {}
        const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const
        let buildingGained = 0
        for (const res of BUILDING_RESOURCES) {
          buildingGained += gainedResources[res] ?? 0
        }
        
        if (buildingGained <= 0) return
        
        return {
          extraData: { incrementBuildingCount: buildingGained },
        }
      },
    }
    registerCardListener(claypipeListener)

    const registry = new ActionRegistry()
    actionDefinitions.forEach((action) => registry.register(action))
    internalActionDefinitions.forEach((action) => registry.register(action))
    
    const hooks = new HookDispatcher()
    const log = new LogStore()
    
    const tree = new EngineTree(new ActionNode('action-gain', 'gain'))
    const engine = new Engine({ tree, registry, hooks, log })
    
    const player = createPlayer({ minorPlayed: ['A53_Claypipe'], cardStates: {} })
    const space = createSpace('day-laborer')
    const state = createState(space, player)

    const result = engine.proceed({ state, player, space })
    
    expect(result.type).toBe('ok')
    expect(player.resources.food).toBe(2)
  })
})
