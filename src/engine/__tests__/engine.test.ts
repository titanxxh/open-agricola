import { describe, it, expect } from 'vitest'
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
import { ActionNode, ChoiceNode, SequenceNode } from '../nodes'

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

const buildEngine = (action: ActionDefinition, withChoice: boolean) => {
  const registry = new ActionRegistry()
  registry.register(action)
  const root = withChoice
    ? new SequenceNode(`sequence-${action.id}`, [
        new ActionNode(`action-${action.id}`, action.id),
        new ChoiceNode(`choice-${action.id}`, []),
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
  it('handles action with choice and resolves to done', () => {
    const action: ActionDefinition = {
      id: 'choice-action',
      nameKey: 'test',
      descriptionKey: 'test',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'choice',
        promptKey: 'choose',
        options: [{ value: 'a', labelKey: 'a' }],
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
})
