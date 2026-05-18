import { beforeEach, describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../contract/types'
import { clearActionHooks } from '../../actions/hooks'
import { setActiveCardRegistry } from '../../cards/active-registry'
import { CardRegistry } from '../../cards/registry'
import { mkActionSpace } from '../../cards/__tests__/fixtures'
import { ActionRegistry } from '../registry'
import { EngineTree } from '../tree'
import { Engine } from '../engine'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { ActionNode, XorNode } from '../nodes'

const createPlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
    grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
  },
  workers: [],
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
  activeModifiers: [],
  cardStates: {},
} as PlayerState)

const createState = (player: PlayerState): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players: [player],
  actionSpaces: [],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
} as GameState)

beforeEach(() => {
  clearActionHooks()
  setActiveCardRegistry(new CardRegistry())
})

describe('composite node actionContext', () => {
  it('filters XOR options using child actionContext in canBeExecutedByPlayer', () => {
    const player = createPlayer()
    const state = createState(player)
    const actionNode = new ActionNode(
      'context-gated-node',
      'context-gated-action',
      undefined,
      undefined,
      undefined,
      undefined,
      { blockedByContext: true },
    )
    const registry = new ActionRegistry()
    registry.register({
      id: 'context-gated-action',
      nameKey: 'test.contextGated',
      descriptionKey: 'test.contextGated',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: (_state, _player, context) =>
        context?.actionContext?.blockedByContext !== true,
      execute: () => ({ type: 'ok' }),
    })
    const engine = new Engine({
      tree: new EngineTree(new XorNode('xor-root', [actionNode])),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })

    const step = engine.proceed({
      state,
      player,
      space: mkActionSpace({ id: 'noop' }),
    })

    expect(step.type).toBe('blocked')
  })
})
