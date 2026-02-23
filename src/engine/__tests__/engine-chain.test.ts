import { describe, expect, it, beforeEach } from 'vitest'
import { ActionRegistry } from '../registry'
import { ActionNode } from '../nodes'
import { Engine } from '../engine'
import { EngineTree } from '../tree'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { actionDefinitions } from '../../actions'
import { internalActionDefinitions } from '../../actions/internal-actions'
import type { ActionSpace, GameState, PlayerState } from '../../game/types'
import { clearActionHooks, registerActionHook } from '../../actions/hooks'

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
    majorEffects: { wellRounds: 0, pendingBake: false },
  startPlayer: false,
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
    takenBy: null,
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
  gameOver: false,
})

describe('engine follow-up actions', () => {
  beforeEach(() => {
    clearActionHooks()
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
})
