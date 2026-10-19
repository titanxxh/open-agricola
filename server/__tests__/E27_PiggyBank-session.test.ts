import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { ActionSpace, GameState, PlayerState, Resource } from '../../shared/contract/types'

import '../../shared/cards/E/E027_PiggyBank'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit33Native from './_helpers/audit/ae-negative-33-native'

const CARD_ID = 'E027_PiggyBank'

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

describe('E027_PiggyBank session', () => {
  it('onBeforeReturnHome offers to place 1 food on card when player has food', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.food = 5

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = session.withCtx(() => effect!.onBeforeReturnHome!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
    const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children[0].actionId).toBe('pay')
    expect(children[1].actionId).toBe('store-on-card')
  })

  it('onBeforeReturnHome returns undefined when player has no food', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.food = 0

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    const flow = session.withCtx(() => effect!.onBeforeReturnHome!(state, player))
    expect(flow).toBeUndefined()
  })


  it('anytime listener returns flow when 6+ food on card', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listeners = withActiveRegistry(ruleRegistry, () => getRegisteredCardListeners())
    const anytimeListener = listeners.find((l) => l.id === 'E27-piggy-bank-anytime')
    expect(anytimeListener).toBeDefined()

    const player = createPlayer('p1', {
      minorPlayed: [CARD_ID],
      cardStates: { [CARD_ID]: { counters: { food: 6 } } },
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
      state, player, space: createSpace('test'),
      actionId: 'test', phase: 'anytime',
    } as CardListenerContext

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(anytimeListener!, context))
    expect(result).toBeDefined()
    expect(result!.flow).toBeDefined()
  })

  it('anytime listener returns nothing when less than 6 food on card', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listeners = withActiveRegistry(ruleRegistry, () => getRegisteredCardListeners())
    const anytimeListener = listeners.find((l) => l.id === 'E27-piggy-bank-anytime')

    const player = createPlayer('p1', {
      minorPlayed: [CARD_ID],
      cardStates: { [CARD_ID]: { counters: { food: 5 } } },
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
      state, player, space: createSpace('test'),
      actionId: 'test', phase: 'anytime',
    } as CardListenerContext

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(anytimeListener!, context))
    expect(result).toBeUndefined()
  })

  it('computeCosts listener zeroes costs when card is flagged', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listeners = withActiveRegistry(ruleRegistry, () => getRegisteredCardListeners())
    const costListener = listeners.find((l) => l.id === 'E27-piggy-bank-compute-costs')
    expect(costListener).toBeDefined()

    const player = createPlayer('p1', {
      minorPlayed: [CARD_ID],
      cardStates: { [CARD_ID]: { flagged: true } },
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
      state, player, space: createSpace('improvement'),
      actionId: 'improvement', phase: 'computeCosts',
      cardId: 'Major_Joinery',
    } as CardListenerContext

    const result = costListener!.deriveCardCostCandidate!(context,
      { resources: { wood: 2, stone: 2 }, originalFeeIndex: 0, sources: [] },
    )
    expect(result).toEqual({
      resources: {},
      originalFeeIndex: 0,
      sources: [CARD_ID],
    })
  })

  it('computeCosts listener returns nothing when card is not flagged', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listeners = withActiveRegistry(ruleRegistry, () => getRegisteredCardListeners())
    const costListener = listeners.find((l) => l.id === 'E27-piggy-bank-compute-costs')

    const player = createPlayer('p1', {
      minorPlayed: [CARD_ID],
      cardStates: { [CARD_ID]: {} },
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
      state, player, space: createSpace('improvement'),
      actionId: 'improvement', phase: 'computeCosts',
    } as CardListenerContext

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(costListener!, context))
    expect(result).toBeUndefined()
  })
})

describe('ae-negative-33-native', () => {
  const { sessions, traces, ok, save, make, take, finish, end, purchase, resource, occupied, major, stored } = audit33Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("E027 N1 real free purchase permits exactly one irreversible food deposit only at work-phase end", () => { const s = make('E027_PiggyBank', undefined, false), bought = purchase(s, 'E027_PiggyBank'); assert.equal(stored(bought), 0); const r = end(s, true); resource(r, { food: 99 }); assert.equal(stored(r), 1); save('E027-N1', { bought, r }); });
  it("E027 N2 five six and seven legally reachable stored food enforce six-food free-major payment without removing a person", () => { for (const n of [5, 6, 7]) {
      const s = make('E027_PiggyBank', st => { st.players[0]!.cardStates.E027_PiggyBank = { counters: { food: n } }; st.players[0]!.resources.food = 10; }, true, n === 7 ? 8 : 7), p = take(s, 0, 'farmland');
      assert.equal(p.interaction.anytimeActions.some(a => a.id === 'E27-piggy-bank-anytime'), n >= 6);
      if (n < 6) {
          const bad = assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, 'E27-piggy-bank-anytime'));
          save(`E027-N2-${n}`, { p, bad });
          continue;
      }
      const offered = ok(s.takeAnytimeAction(0, 'E27-piggy-bank-anytime')), r = finish(s, offered, true, ['Major_Joinery']);
      resource(r, { wood: 0, stone: 0, food: 10 });
      assert.equal(stored(r), n - 6);
      assert.equal(s.buildSyncPayload(r, 'p1').state.players[0]!.cardStatePresentation[CARD_ID]?.infobox, `${n - 6} / 6`);
      assert.ok(r.state.players[0]!.improvements.includes('Major_Joinery'));
      assert.equal(occupied(r).length, 1);
      assert.equal(r.interaction.anytimeActions.some(a => a.id === 'E27-piggy-bank-anytime'), false);
      save(`E027-N2-${n}`, { p, offered, r });
  } });
  it("E027 N3 decline empty personal food held card and ordinary major purchase cannot store or leak a free discount", () => { for (const mode of ['decline', 'food', 'hand']) {
      const s = make('E027_PiggyBank', st => { if (mode === 'food')
          st.players[0]!.resources.food = 0; }, mode !== 'hand', 5), r = end(s, mode !== 'decline', [], mode === 'decline' ? undefined : 'E027_PiggyBank');
      resource(r, { food: mode === 'food' ? 0 : 100 });
      assert.equal(stored(r), 0);
      save(`E027-N3-${mode}`, r);
  } const s = make('E027_PiggyBank', st => { st.players[0]!.resources.clay = 2; }), r = finish(s, major(s, 'Major_Fireplace1')); resource(r, { clay: 0 }); assert.equal(stored(r), 0); save('E027-N3-major', r); });
})
