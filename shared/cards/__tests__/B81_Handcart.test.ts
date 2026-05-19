import { describe, expect, it } from 'vitest'
import { runCardEffectHook } from '../card-effects'
import type { GameState, PlayerState, ActionSpace , ActionFlow } from '../../contract/types'
import { collectAction } from '../../actions/effects/collect'
import { Engine } from '../../engine/engine'
import { HookDispatcher } from '../../engine/dispatcher'
import { LogStore } from '../../engine/log-store'
import { ActionNode } from '../../engine/nodes'
import { ActionRegistry } from '../../engine/registry'
import { EngineTree } from '../../engine/tree'

import '../B/B81_Handcart'

const CARD_ID = 'B81_Handcart'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as unknown as PlayerState

const createSpace = (id: string, overrides?: Partial<ActionSpace>): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
    ...overrides,
  }) as ActionSpace

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 5, roundPhase: 'work', currentPlayerIndex: 0, players,
    actionSpaces: [
      createSpace('wood-accumulation', {
        gainPerRound: { wood: 3 },
        resources: { wood: 9, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
      }),
      createSpace('clay-pit', {
        gainPerRound: { clay: 1 },
        resources: { wood: 0, clay: 3, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
      }),
    ],
    log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    events: [], nextEventSeq: 1,
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

const executeFlowLeaf = (state: GameState, player: PlayerState, flow: ActionFlow) => {
  if (flow.type !== 'leaf') throw new Error('expected leaf flow')
  const registry = new ActionRegistry()
  registry.register(collectAction)
  const engine = new Engine({
    tree: new EngineTree(new ActionNode(
      'handcart-leaf',
      flow.actionId,
      flow.sourceCard,
      flow.params,
      flow.choiceLabelKey,
      flow.choiceLabelParams,
      flow.actionContext,
      flow.effectPreview,
    )),
    registry,
    hooks: new HookDispatcher(),
    log: new LogStore(),
  })
  const space = state.actionSpaces.find((entry) => entry.id === 'wood-accumulation')!
  const result = engine.proceed({ state, player, space })
  for (let safety = 0; safety < 10; safety += 1) {
    if (engine.proceed({ state, player, space }).type === 'done') break
  }
  return result
}

describe('B81_Handcart', () => {
  it('offers xor with wood option when wood space has >= 6 wood', () => {
    const player = createPlayer()
    const state = createState(player)
    const flow = runCardEffectHook(state, player, CARD_ID, 'onRoundStart')
    expect(flow).not.toBeNull()
    const xor = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(xor.type).toBe('xor')
    expect(xor.optional).toBe(true)
    // Only wood qualifies (9 >= 6), clay doesn't (3 < 5)
    expect(xor.children).toHaveLength(1)
    expect(xor.children[0].actionId).toBe('collect')
    expect(xor.children[0].actionContext).toMatchObject({
      spaceId: 'wood-accumulation',
      resource: 'wood',
      amount: 1,
    })

    const woodSpace = state.actionSpaces.find((entry) => entry.id === 'wood-accumulation')!
    const woodBefore = woodSpace.resources.wood
    const result = executeFlowLeaf(state, player, xor.children[0])
    expect(result.type).toBe('ok')
    expect(player.resources.wood).toBe(1)
    expect(woodSpace.resources.wood).toBe(woodBefore - 1)
    expect(state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        sourceCardId: CARD_ID,
        from: expect.objectContaining({ kind: 'actionSpace' }),
        to: { kind: 'player', playerId: player.id },
      }),
    ]))
    expect(state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        sourceCardId: CARD_ID,
        from: { kind: 'supply' },
      }),
    ]))
  })

  it('offers multiple options when multiple spaces qualify', () => {
    const player = createPlayer()
    const state = createState(player)
    // Make clay space qualify too (>= 5)
    const claySpace = state.actionSpaces.find((s) => s.id === 'clay-pit')!
    claySpace.resources.clay = 5

    const flow = runCardEffectHook(state, player, CARD_ID, 'onRoundStart')
    expect(flow).not.toBeNull()
    const xor = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(xor.children).toHaveLength(2)
  })

  it('returns nothing when no space qualifies', () => {
    const player = createPlayer()
    const state = createState(player)
    // Reduce wood below threshold
    const woodSpace = state.actionSpaces.find((s) => s.id === 'wood-accumulation')!
    woodSpace.resources.wood = 5

    const flow = runCardEffectHook(state, player, CARD_ID, 'onRoundStart')
    expect(flow).toBeNull()
    expect(state.events).toEqual([])
  })

})
