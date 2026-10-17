import { CardRegistry as TestCardRegistry } from '../../shared/cards/registry'
import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { ActionFlow, ActionSpace, GameState, PlayerState, Resource } from '../../shared/contract/types'

import '../../shared/cards/E/E123_ResourceHoarder'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit50Cards from './_helpers/audit/ae-negative-50-cards'

const CARD_ID = 'E123_ResourceHoarder'

const emptyResources = (): Resource => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
})

const createPlayer = (id = 'p1', overrides?: Partial<PlayerState>): PlayerState => ({
  id, name: id, color: 'red',
  resources: emptyResources(),
  workers: [
    { id: '1', isActive: true, isNewborn: false },
    { id: '2', isActive: true, isNewborn: false },
    { id: '3', isActive: false, isNewborn: false },
    { id: '4', isActive: false, isNewborn: false },
    { id: '5', isActive: false, isNewborn: false },
  ],
  rooms: 2, houseType: 'wood',
  fields: [], fences: 0,
  roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
  stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [],
  occupationHand: [], occupationPlayed: [],houseAnimals: {}, stableAnimals: {},
  pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 }, startPlayer: false,
  activeModifiers: [], cardStates: {},
  ...overrides,
} as PlayerState)

const createSpace = (id: string): ActionSpace => ({
  id,
  nameKey: id,
  descriptionKey: id,
  roundAvailable: 1,
  gainPerRound: {},
  resources: emptyResources(),
  takenBy: [],
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  resolveChoice: () => ({ type: 'ok' }),
})

const executeSpecialEffectLeaves = (
  ruleOwner: TestCardRegistry,
  flow: ActionFlow | undefined,
  state: GameState,
  player: PlayerState,
) => {
  if (!flow) return
  if (flow.type === 'seq') {
    flow.children.forEach((child) => executeSpecialEffectLeaves(ruleOwner, child, state, player))
    return
  }
  if (flow.type !== 'leaf' || flow.actionId !== 'special-effect') return
  withActiveRegistry(ruleOwner, () => specialEffectAction.execute({
    actionHooks: undefined,
    state,
    player,
    space: createSpace('test'),
    params: flow.params,
    sourceCard: flow.sourceCard,
    actionContext: flow.actionContext,
  }))
}

describe('E123_ResourceHoarder session', () => {
  it('onBuy initializes the stack with 6 resources bottom to top', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    session.withCtx(() => effect!.onBuy!(state, player))

    const stack = player.cardStates?.[CARD_ID]?.stack
    expect(stack).toBeDefined()
    expect(stack).toEqual(['stone', 'clay', 'stone', 'reed', 'wood', 'clay'])
  })

  it('computeCosts listener offers discount of top resource (clay)', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listeners = withActiveRegistry(ruleRegistry, () => getRegisteredCardListeners())
    const costListener = listeners.find((l) => l.id === 'E123-resource-hoarder-compute-costs')
    expect(costListener).toBeDefined()

    const player = createPlayer('p1', {
      occupationPlayed: [CARD_ID],
      cardStates: {
        [CARD_ID]: { stack: ['stone', 'clay', 'stone', 'reed', 'wood', 'clay'] },
      },
    })
    const state: GameState = {
      round: 5, currentPlayerIndex: 0, players: [player],
      actionSpaces: [], log: [],
      roundActionOrder: Array.from({ length: 14 }).map(() => null),
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as GameState

    const context: CardListenerContext = {
      state, player, space: createSpace('construct'),
      actionId: 'construct', phase: 'computeCosts',
    } as CardListenerContext

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(costListener!, context))
    expect(result).toBeDefined()
    expect(result!.bonuses).toBeDefined()
    expect(result!.bonuses).toHaveLength(1)
    // 7b1 use-top-k upgrade: bonuses[0] now carries N+1 BonusChoice entries.
    // For stack [stone, clay, stone, reed, wood, clay] (N=6), choices[1]
    // (k=1, top-1) is still the legacy "clay 1" discount.
    expect(result!.bonuses![0]!.choices).toBeDefined()
    expect(result!.bonuses![0]!.choices!).toHaveLength(7)
    expect(result!.bonuses![0]!.choices![1]!.discount).toEqual({ clay: 1 })
    expect(result!.bonuses![0]!.optional).toBe(true)
    expect(result!.bonuses![0]!.sources).toEqual([CARD_ID])
  })

  it('computeCosts listener returns nothing when stack is empty', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listeners = withActiveRegistry(ruleRegistry, () => getRegisteredCardListeners())
    const costListener = listeners.find((l) => l.id === 'E123-resource-hoarder-compute-costs')

    const player = createPlayer('p1', {
      occupationPlayed: [CARD_ID],
      cardStates: { [CARD_ID]: { stack: [] } },
    })
    const state: GameState = {
      round: 5, currentPlayerIndex: 0, players: [player],
      actionSpaces: [], log: [],
      roundActionOrder: Array.from({ length: 14 }).map(() => null),
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as GameState

    const context: CardListenerContext = {
      state, player, space: createSpace('construct'),
      actionId: 'construct', phase: 'computeCosts',
    } as CardListenerContext

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(costListener!, context))
    expect(result).toBeUndefined()
  })

  it('after-pay listener pops top resource from stack', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listeners = withActiveRegistry(ruleRegistry, () => getRegisteredCardListeners())
    const afterPayListener = listeners.find((l) => l.id === 'E123-resource-hoarder-after-pay')
    expect(afterPayListener).toBeDefined()
    expect(afterPayListener!.actions).toEqual(['pay'])

    const player = createPlayer('p1', {
      occupationPlayed: [CARD_ID],
      cardStates: {
        [CARD_ID]: { stack: ['stone', 'clay', 'stone', 'reed', 'wood', 'clay'] },
      },
    })
    const state: GameState = {
      round: 5, currentPlayerIndex: 0, players: [player],
      actionSpaces: [], log: [],
      roundActionOrder: Array.from({ length: 14 }).map(() => null),
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as GameState

    const context: CardListenerContext = {
      state, player, space: createSpace('pay'),
      actionId: 'pay', phase: 'after',
      transactionEvents: [{
        type: 'resource.paid',
        resources: { clay: 1 },
        paymentFor: 'construct',
        bonusSources: [CARD_ID],
        bonusChoiceIndex: { [CARD_ID]: 1 },
      }],
    } as CardListenerContext

    executeSpecialEffectLeaves(ruleRegistry, withActiveRegistry(ruleRegistry, () => executeCardListener(afterPayListener!, context))?.flow, state, player)
    expect(player.cardStates[CARD_ID]!.stack).toEqual(
      ['stone', 'clay', 'stone', 'reed', 'wood'],
    )
  })

  it('after-pay listener does nothing when stack is empty', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listeners = withActiveRegistry(ruleRegistry, () => getRegisteredCardListeners())
    const afterPayListener = listeners.find((l) => l.id === 'E123-resource-hoarder-after-pay')

    const player = createPlayer('p1', {
      occupationPlayed: [CARD_ID],
      cardStates: { [CARD_ID]: { stack: [] } },
    })
    const state: GameState = {
      round: 5, currentPlayerIndex: 0, players: [player],
      actionSpaces: [], log: [],
      roundActionOrder: Array.from({ length: 14 }).map(() => null),
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as GameState

    const context: CardListenerContext = {
      state, player, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as CardListenerContext

    withActiveRegistry(ruleRegistry, () => executeCardListener(afterPayListener!, context))
    expect(player.cardStates[CARD_ID]!.stack).toEqual([])
  })

  it('after-pay listener does NOT pop when E123 was not used in payment', () => {
    const ruleRegistry = createOfficialCardRegistry()
    // Bug fix: previously the after-pay listener popped unconditionally.
    // It must only pop when _activeActionBonusSources includes E123.
    const listeners = withActiveRegistry(ruleRegistry, () => getRegisteredCardListeners())
    const afterPayListener = listeners.find((l) => l.id === 'E123-resource-hoarder-after-pay')
    expect(afterPayListener).toBeDefined()

    const player = createPlayer('p1', {
      occupationPlayed: [CARD_ID],
      cardStates: {
        [CARD_ID]: { stack: ['stone', 'clay', 'stone', 'reed', 'wood', 'clay'] },
      },
      // _activeActionBonusSources is the canonical "this card's bonus actually fired" signal.
      _activeActionBonusSources: [], // E123 NOT in the list
    })
    const state: GameState = {
      round: 5, currentPlayerIndex: 0, players: [player],
      actionSpaces: [], log: [],
      roundActionOrder: Array.from({ length: 14 }).map(() => null),
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as GameState

    const context: CardListenerContext = {
      state, player, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as CardListenerContext

    withActiveRegistry(ruleRegistry, () => executeCardListener(afterPayListener!, context))
    // Stack remains intact (no pop because E123 wasn't used)
    expect(player.cardStates[CARD_ID]!.stack).toEqual(
      ['stone', 'clay', 'stone', 'reed', 'wood', 'clay'],
    )
  })

  it('after-pay listener ignores legacy construct _activeActionBonusSources path', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listeners = withActiveRegistry(ruleRegistry, () => getRegisteredCardListeners())
    const afterPayListener = listeners.find((l) => l.id === 'E123-resource-hoarder-after-pay')!

    const player = createPlayer('p1', {
      occupationPlayed: [CARD_ID],
      cardStates: {
        [CARD_ID]: { stack: ['stone', 'clay', 'stone', 'reed', 'wood', 'clay'] },
      },
      _activeActionBonusSources: [CARD_ID],
    })
    const state: GameState = {
      round: 5, currentPlayerIndex: 0, players: [player],
      actionSpaces: [], log: [],
      roundActionOrder: Array.from({ length: 14 }).map(() => null),
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as GameState

    const context: CardListenerContext = {
      state, player, space: createSpace('construct'),
      actionId: 'construct', phase: 'after',
    } as CardListenerContext

    withActiveRegistry(ruleRegistry, () => executeCardListener(afterPayListener, context))
    expect(player.cardStates[CARD_ID]!.stack).toEqual(
      ['stone', 'clay', 'stone', 'reed', 'wood', 'clay'],
    )
  })

  it('successive pops reveal deeper stack resources', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listeners = withActiveRegistry(ruleRegistry, () => getRegisteredCardListeners())
    const afterPayListener = listeners.find((l) => l.id === 'E123-resource-hoarder-after-pay')!
    const costListener = listeners.find((l) => l.id === 'E123-resource-hoarder-compute-costs')!

    const player = createPlayer('p1', {
      occupationPlayed: [CARD_ID],
      cardStates: {
        [CARD_ID]: { stack: ['stone', 'clay', 'stone', 'reed', 'wood', 'clay'] },
      },
    })
    const state: GameState = {
      round: 5, currentPlayerIndex: 0, players: [player],
      actionSpaces: [], log: [],
      roundActionOrder: Array.from({ length: 14 }).map(() => null),
      gameSeed: 1, availableMajorImprovements: [],
      futureMeeples: [], pendingFutureMeeples: [],
      gameOver: false, workPhaseObtainedResources: {},
    } as GameState

    const mkContext = (actionId: string, phase: string, bonusChoiceIndex?: number) => ({
      state, player, space: createSpace(actionId),
      actionId, phase,
      transactionEvents: bonusChoiceIndex === undefined ? [] : [{
        type: 'resource.paid',
        resources: {},
        paymentFor: 'construct',
        bonusSources: [CARD_ID],
        bonusChoiceIndex: { [CARD_ID]: bonusChoiceIndex },
      }],
    } as CardListenerContext)

    // Top is clay (k=1 entry of N+1 choices)
    let result = withActiveRegistry(ruleRegistry, () => executeCardListener(costListener, mkContext('construct', 'computeCosts')))
    expect(result!.bonuses![0]!.choices![1]!.discount).toEqual({ clay: 1 })

    // Pop clay
    executeSpecialEffectLeaves(
      ruleRegistry,
      withActiveRegistry(ruleRegistry, () => executeCardListener(afterPayListener, mkContext('pay', 'after', 1)))?.flow,
      state,
      player,
    )

    // Now top is wood
    result = withActiveRegistry(ruleRegistry, () => executeCardListener(costListener, mkContext('construct', 'computeCosts')))
    expect(result!.bonuses![0]!.choices![1]!.discount).toEqual({ wood: 1 })

    // Pop wood
    executeSpecialEffectLeaves(
      ruleRegistry,
      withActiveRegistry(ruleRegistry, () => executeCardListener(afterPayListener, mkContext('pay', 'after', 1)))?.flow,
      state,
      player,
    )

    // Now top is reed
    result = withActiveRegistry(ruleRegistry, () => executeCardListener(costListener, mkContext('improvement', 'computeCosts')))
    expect(result!.bonuses![0]!.choices![1]!.discount).toEqual({ reed: 1 })
  })
})

describe('ae-negative-50-cards', () => {
  const { sessions, save, ok, make, finish, lesson, resources, rooms, build, improvement, ownerTurn, topPayment } = audit50Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E123 N1 actual Lessons piles six goods and real Fireplace can use exactly top clay or decline use', () => { for (const k of [0, 1]) { const s = make('E123_ResourceHoarder', st => { st.players[0]!.resources.clay = 2; st.availableMajorImprovements = ['Major_Fireplace1'] }, false), played = finish(s, lesson(s, 'E123_ResourceHoarder')); assert.deepEqual(played.state.players[0]!.cardStates.E123_ResourceHoarder?.stack, ['stone', 'clay', 'stone', 'reed', 'wood', 'clay']); ownerTurn(s); const p = improvement(s), r = finish(s, topPayment(s, p, k), false); resources(r, { clay: k }); assert.deepEqual(r.state.players[0]!.cardStates.E123_ResourceHoarder?.stack, ['stone', 'clay', 'stone', 'reed', 'wood', 'clay'].slice(0, 6 - k)); assert.ok(r.state.players[0]!.improvements.includes('Major_Fireplace1')); save(`E123-N1-${k}`, { played, p, r }) } })
  it('E123 N2 native room and renovation consumes top clay while covered wood cannot be reached', () => { for (const [house, kind, k] of [['clay', 'room', 1], ['wood', 'room', 0], ['wood', 'renovate', 1]] as const) { const s = make('E123_ResourceHoarder', st => { rooms(st, 2, house); Object.assign(st.players[0]!.resources, { [house]: 5, clay: house === 'wood' ? 2 : 5, reed: 2 }) }, false, 14), played = finish(s, lesson(s, 'E123_ResourceHoarder')); ownerTurn(s); const p = kind === 'room' ? build(s, 1, 'room', false) : ok(s.takeAction(0, 'house-redevelopment')), r = finish(s, topPayment(s, p, k), false); resources(r, kind === 'room' ? { [house]: k > 0 ? 1 : 0, reed: 0 } : { clay: 1, reed: 1 }); assert.deepEqual(r.state.players[0]!.cardStates.E123_ResourceHoarder?.stack, ['stone', 'clay', 'stone', 'reed', 'wood', 'clay'].slice(0, 6 - k)); save(`E123-N2-${house}-${kind}`, { played, p, r }) } })
  it('E123 N3 noneligible Day Laborer preserves stack and invalid payment rejects before legal retry while unplayed has no discount', () => { const s = make('E123_ResourceHoarder', st => { st.players[0]!.resources.clay = 2; st.availableMajorImprovements = ['Major_Fireplace1'] }, false), played = finish(s, lesson(s, 'E123_ResourceHoarder')); ownerTurn(s); const a = finish(s, ok(s.takeAction(0, 'day-laborer')), false); assert.equal(a.state.players[0]!.cardStates.E123_ResourceHoarder?.stack?.length, 6); ownerTurn(s); const p = improvement(s), rejected = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'use-lower-stone-only')), r = finish(s, topPayment(s, p, 1), false); resources(r, { clay: 1 }); const c = make('E123_ResourceHoarder', st => { st.players[0]!.resources.clay = 1; st.availableMajorImprovements = ['Major_Fireplace1'] }, false), rejectedHand = assertRejectedUnchanged(c, () => c.takeAction(0, 'major-improvement')), cr = finish(c, ok(c.takeAction(0, 'grain-seeds')), false); resources(cr, { grain: 1, clay: 1 }); save('E123-N3', { played, a, p, rejected, r, rejectedHand, cr }) })
})
