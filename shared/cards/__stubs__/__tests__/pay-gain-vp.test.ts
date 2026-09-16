import { beforeEach, describe, expect, it } from 'vitest'
import type { GameState, PlayerState, ActionSpace, ActionDefinition } from '../../../contract/types'
import { ActionRegistry } from '../../../engine/registry'
import { Engine } from '../../../engine/engine'
import { EngineTree } from '../../../engine/tree'
import { HookDispatcher } from '../../../engine/dispatcher'
import { LogStore } from '../../../engine/log-store'
import { ActionNode } from '../../../engine/nodes'
import { clearActionHooks } from '../../../actions/hooks'
import { registerStubCards, clearStubCards } from '../index'
import { CARD_ID } from '../Stub_PayGainVp'
import { internalActionDefinitions } from '../../../actions/index'
import { computeScores } from '../../../domain/scoring'

const gainAction = internalActionDefinitions.find(a => a.id === 'gain')!
const payResourcesAction = internalActionDefinitions.find(a => a.id === 'pay')!
const bonusVpAction = internalActionDefinitions.find(a => a.id === 'bonus-vp')!

const makeRenovateAction = (): ActionDefinition => ({
  id: 'renovate-house',
  nameKey: 'actions.renovateHouse.name',
  descriptionKey: 'actions.renovateHouse.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    player.houseType = 'clay'
    return { type: 'ok' }
  },
})

const createPlayer = (id = 'p1', name = 'P1'): PlayerState =>
  ({
    id, name, color: 'red',
    resources: {
      wood: 5, clay: 5, reed: 5, stone: 5, food: 5,
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
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [], roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (action: ActionDefinition): ActionSpace => ({
  ...action,
  resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
  takenBy: [],
})

describe('Stub_PayGainVp mechanism', () => {
  beforeEach(() => {
    clearActionHooks()
    clearStubCards()
    registerStubCards()
  })

  it('presents optional pay flow after renovate, pay gives grain + bonusVp', () => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    const renovate = makeRenovateAction()
    const registry = new ActionRegistry()
    registry.register(renovate)
    registry.register(gainAction)
    registry.register(payResourcesAction)
    registry.register(bonusVpAction)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', 'renovate-house')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const space = createSpace(renovate)
    const state = createState(player)

    let step = engine.proceed({ state, player, space })
    while (step.type === 'ok') {
      step = engine.proceed({ state, player, space })
    }
    expect(step.type).toBe('choice')
    if (step.type !== 'choice') return

    // If this is a select-trigger prompt (single interactive listener wrapped
    // in PARALLEL — mandatory default means no __pass__), resolve it by
    // selecting the card first, then proceed to the actual optional choice.
    if (step.choice.options.some(o => o.value === CARD_ID)) {
      const triggerResult = engine.resolveChoice(CARD_ID, { state, player, space })
      expect(triggerResult.type).not.toBe('fail')
      step = engine.proceed({ state, player, space })
      while (step.type === 'ok') {
        step = engine.proceed({ state, player, space })
      }
      expect(step.type).toBe('choice')
      if (step.type !== 'choice') return
    }

    const payOption = step.choice.options.find(o => o.value !== '__skip__')
    expect(payOption).toBeDefined()
    expect(step.choice.options.some(o => o.value === '__skip__')).toBe(true)

    const result = engine.resolveChoice(payOption!.value, { state, player, space })
    expect(result.type).not.toBe('fail')

    let step2 = engine.proceed({ state, player, space })
    while (step2.type === 'ok') {
      step2 = engine.proceed({ state, player, space })
    }

    expect(player.resources.wood).toBe(4)
    expect(player.resources.grain).toBe(1)
    expect(player.cardStates?.[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(player.cardStates?.[CARD_ID]?.counters?.observedCount).toBe(1)
  })

  it('skip choice does not change resources', () => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    const renovate = makeRenovateAction()
    const registry = new ActionRegistry()
    registry.register(renovate)
    registry.register(gainAction)
    registry.register(payResourcesAction)
    registry.register(bonusVpAction)
    const engine = new Engine({
      tree: new EngineTree(new ActionNode('a', 'renovate-house')),
      registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    const space = createSpace(renovate)
    const state = createState(player)

    let step = engine.proceed({ state, player, space })
    while (step.type === 'ok') {
      step = engine.proceed({ state, player, space })
    }
    if (step.type !== 'choice') return

    engine.resolveChoice('__skip__', { state, player, space })
    let step2 = engine.proceed({ state, player, space })
    while (step2.type === 'ok') {
      step2 = engine.proceed({ state, player, space })
    }

    expect(player.resources.wood).toBe(5)
    expect(player.resources.grain).toBe(0)
    expect(player.cardStates?.[CARD_ID]?.counters?.bonusVp).toBeUndefined()
  })

  it('bonusVp is included in scoring', () => {
    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.cardStates = {
      [CARD_ID]: { counters: { bonusVp: 3, observedCount: 3 } },
    }
    const state = createState(player)
    const scores = computeScores(state)
    const p1Score = scores[0]
    const bonusCategory = p1Score.categories.find(c => c.key === 'cardBonusVp')
    expect(bonusCategory).toBeDefined()
    expect(bonusCategory!.total).toBe(3)
    expect(bonusCategory!.entries).toEqual([
      expect.objectContaining({
        type: 'bonus',
        cardId: CARD_ID,
        cardType: 'minor',
        score: 3,
      }),
    ])
  })
})
