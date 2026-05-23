import { beforeEach, describe, it, expect } from 'vitest'
import type {
  ActionDefinition,
  ActionAvailabilityContext,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../contract/types'
import { HookDispatcher } from '../dispatcher'
import { clearActionHooks, registerActionHook } from '../../actions/hooks'
import { CardRegistry } from '../../cards/registry'
import { setActiveCardRegistry } from '../../cards/active-registry'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id,
    name: id,
    color: 'red',
    resources: {
      wood: 10, clay: 10, reed: 10, stone: 10, food: 10,
      grain: 10, vegetable: 10, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
    ],
    rooms: 2,
    houseType: 'wood',
    fields: [],
    fences: 0,
    roomTiles: [],
    stableTiles: [],
    improvements: [],
    minorHand: ['__test_placeholder__'],
    minorPlayed: [],
    occupationHand: ['__test_placeholder__'],
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
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
    grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
  },
  takenBy: [],
})

const createState = (player: PlayerState): GameState =>
  ({
    round: 1,
    currentPlayerIndex: 0,
    players: [player],
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: [],
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
  }) as GameState

const makeRecordingAction = (
  recorded: { costOverride?: Record<string, number> },
): ActionDefinition => ({
  id: 'test-action',
  nameKey: 'test',
  descriptionKey: 'test',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  costPreview: {
    getBaseCost: () => ({}),
    canExecute: (_ctx: ActionAvailabilityContext, override?: Record<string, number>) => {
      recorded.costOverride = override
      return true
    },
  },
  execute: () => ({ type: 'ok' }),
} as unknown as ActionDefinition)

describe('dispatcher: actionContext.costOverride merges into canExecute', () => {
  beforeEach(() => {
    clearActionHooks()
    setActiveCardRegistry(new CardRegistry())
  })

  it('merges actionContext.costOverride with listener override (values summed)', () => {
    registerActionHook({
      id: 'listener-discount',
      actions: ['test-action'],
      phases: ['computeCosts'],
      handler: () => ({ costs: { wood: -2 } }),
    })

    const player = createPlayer()
    const state = createState(player)
    const recorded: { costOverride?: Record<string, number> } = {}
    const action = makeRecordingAction(recorded)
    const dispatcher = new HookDispatcher()

    dispatcher.applyIsDoable(
      {
        state,
        player,
        space: createSpace(action),
        actionId: 'test-action',
        actionContext: { costOverride: { wood: -3 } },
      },
      action,
      true,
    )

    expect(recorded.costOverride?.wood).toBe(-5)
  })

  it('forwards actionContext.costOverride alone when no listener override', () => {
    const player = createPlayer()
    const state = createState(player)
    const recorded: { costOverride?: Record<string, number> } = {}
    const action = makeRecordingAction(recorded)
    const dispatcher = new HookDispatcher()

    dispatcher.applyIsDoable(
      {
        state,
        player,
        space: createSpace(action),
        actionId: 'test-action',
        actionContext: { costOverride: { wood: -3 } },
      },
      action,
      true,
    )

    expect(recorded.costOverride?.wood).toBe(-3)
  })

  it('forwards listener override unchanged when no actionContext.costOverride', () => {
    registerActionHook({
      id: 'listener-discount-only',
      actions: ['test-action'],
      phases: ['computeCosts'],
      handler: () => ({ costs: { wood: -2 } }),
    })

    const player = createPlayer()
    const state = createState(player)
    const recorded: { costOverride?: Record<string, number> } = {}
    const action = makeRecordingAction(recorded)
    const dispatcher = new HookDispatcher()

    dispatcher.applyIsDoable(
      {
        state,
        player,
        space: createSpace(action),
        actionId: 'test-action',
      },
      action,
      true,
    )

    expect(recorded.costOverride?.wood).toBe(-2)
  })
})
