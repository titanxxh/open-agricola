import { beforeEach, describe, expect, it } from 'vitest'
import type {
  ActionDefinition,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../../contract/types'
import { B065_GrainDepot_impl } from '../../../cards/B/B065_GrainDepot'
import { setActiveCardRegistry } from '../../../cards/active-registry'
import { CardRegistry } from '../../../cards/registry'
import { Engine } from '../../../engine/engine'
import { EngineTree } from '../../../engine/tree'
import { HookDispatcher } from '../../../engine/dispatcher'
import { LogStore } from '../../../engine/log-store'
import { ActionNode, SequenceNode } from '../../../engine/nodes'
import { ActionRegistry } from '../../../engine/registry'
import { internalActionDefinitions } from '../../internal-actions'

const CARD_ID = 'B065_GrainDepot'

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
      wood: 2,
      clay: 2,
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
    improvements: [CARD_ID],
    minorHand: [],
    minorPlayed: [CARD_ID],
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

const buildEngine = (actions: ActionDefinition[], hostActionId: string) => {
  const registry = new ActionRegistry()
  actions.forEach((action) => registry.register(action))
  const root = new SequenceNode(`sequence-${hostActionId}`, [
    new ActionNode(`action-${hostActionId}`, hostActionId),
  ])
  return new Engine({
    tree: new EngineTree(root),
    registry,
    hooks: new HookDispatcher(),
    log: new LogStore(),
  })
}

const runUntilDone = (
  engine: Engine,
  context: { state: GameState; player: PlayerState; space: ActionSpace },
) => {
  let step = engine.proceed(context)
  let safety = 20
  while (safety-- > 0 && step.type === 'ok') {
    step = engine.proceed(context)
  }
  return step
}

describe('pay child context', () => {
  beforeEach(() => {
    const registry = new CardRegistry()
    registry.loadImpl(CARD_ID, B065_GrainDepot_impl)
    setActiveCardRegistry(registry)
  })

  it('passes selected pay result paymentInfo to a sibling activate-card-effect child', () => {
    const hostAction: ActionDefinition = {
      id: 'host-pay-child',
      nameKey: 'test.hostPayChild',
      descriptionKey: 'test.hostPayChild',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({
        type: 'ok',
        internalChildren: {
          beforeHostListeners: [
            {
              actionId: 'pay',
              params: {
                cost: { fees: [{ wood: 2 }, { clay: 2 }, { stone: 2 }] },
                optionPrefix: 'pay:test:b65',
              },
              resultKey: 'payment',
            },
            {
              actionId: 'activate-card-effect',
              params: { cardId: CARD_ID, hook: 'onBuy' },
              paymentInfoFrom: 'payment',
            },
          ],
        },
      }),
    }
    const state = createState()
    const player = createPlayer()
    state.players = [player]
    const space = createSpace(hostAction)
    const engine = buildEngine([hostAction, ...internalActionDefinitions], hostAction.id)

    expect(engine.proceed({ state, player, space }).type).toBe('ok')
    const pendingStep = engine.proceed({ state, player, space })

    expect(pendingStep.type).toBe('choice')
    expect(engine.peekPendingEnvelope()).toMatchObject({
      promptKey: 'prompt.selectPayment',
      pendingActionId: 'pay',
      internalResultKey: 'payment',
    })

    const resolved = engine.resolveChoice('pay:test:b65:1', { state, player, space })
    expect(resolved.type).toBe('ok')
    const finalStep = runUntilDone(engine, { state, player, space })

    expect(finalStep.type).toBe('done')
    expect(state.futureMeeples).toHaveLength(3)
    expect(state.futureMeeples.map((entry) => entry.resources)).toEqual([
      { grain: 1 },
      { grain: 1 },
      { grain: 1 },
    ])
  })

  it('preserves selected paymentInfo on the public improvement pay apply path', () => {
    const state = createState()
    const player = createPlayer()
    player.minorHand = [CARD_ID]
    player.minorPlayed = []
    player.improvements = []
    state.players = [player]
    const improvementAction = internalActionDefinitions.find((action) => action.id === 'improvement')
    if (!improvementAction) throw new Error('missing improvement action')
    const space = createSpace(improvementAction)
    const engine = buildEngine(internalActionDefinitions, improvementAction.id)

    const improvementStep = engine.proceed({ state, player, space })
    expect(improvementStep.type).toBe('choice')
    const improvementChoice = improvementStep.type === 'choice'
      ? improvementStep.choice.options.find((option) => option.value === CARD_ID)
      : undefined
    expect(improvementChoice).toBeDefined()

    const improvementResolved = engine.resolveChoice(improvementChoice!.value, { state, player, space })
    expect(improvementResolved.type).toBe('ok')
    const paymentStep = engine.proceed({ state, player, space })
    expect(paymentStep.type).toBe('choice')
    expect(engine.peekPendingEnvelope()).toMatchObject({
      promptKey: 'prompt.selectPayment',
      pendingActionId: 'pay',
    })

    const paymentResolved = engine.resolveChoice(`pay:improvement:minor:${CARD_ID}:1`, { state, player, space })
    expect(paymentResolved.type).toBe('ok')
    const finalStep = runUntilDone(engine, { state, player, space })

    expect(finalStep.type).toBe('done')
    expect(player.minorPlayed).toContain(CARD_ID)
    expect(state.futureMeeples).toHaveLength(3)
    expect(state.futureMeeples.map((entry) => entry.resources)).toEqual([
      { grain: 1 },
      { grain: 1 },
      { grain: 1 },
    ])
  })
})
