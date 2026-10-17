import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import { getActiveCardRegistry } from '../../shared/cards/active-registry'

import '../../shared/cards/C/C052_HuntsmansHat'
import type { ActionExecutionResult, ActionFlow } from '../../shared/contract/types'
import type { DraftGameEvent } from '../../shared/contract/events'
import assert from 'node:assert/strict'
import { assertEmptyAccumulationRejected } from './_helpers/negative-rule-audit'
import * as audit37Food from './_helpers/audit/ae-negative-37-food'

const CARD_ID = 'C052_HuntsmansHat'
const LISTENER_ID = 'C52-huntsmans-hat-after-boar-gain'

const findListener = (ruleOwner: SessionRuleOwner, id: string) =>
  ruleOwner.withCtx(() => getRegisteredCardListeners()).find((l) => l.id === id)

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { boar: 1 },
  from: { kind: 'actionSpace', spaceId: 'pig-market' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
  ...overrides,
})

describe('C052_HuntsmansHat server session', () => {
  it('adds food and logs cardEffectGain when collecting boar from pig-market', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]
    player.resources.food = 0
    player.resources.boar = 0
    if (!player.minorPlayed.includes(CARD_ID)) {
      player.minorPlayed.push(CARD_ID)
    }

    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (!pigMarket) throw new Error('pig-market space missing')
    pigMarket.resources.boar = 2

    session.loadState(state)
    let resp = session.takeAction(0, 'pig-market')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0].resources.boar).toBe(2)

    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'house:1-0', zoneType: 'house', animalType: 'boar', animalCount: 1 },
      ] as unknown as Record<string, unknown>)
    }

    expect(resp.state.players[0].resources.boar).toBeGreaterThanOrEqual(1)

    expect(resp.state.players[0].resources.food).toBe(2)
    const hasLog = resp.state.log.some(
      (e) =>
        e.key === 'log.cardEffectGain' &&
        e.params?.cardId === CARD_ID,
    )
    expect(hasLog).toBe(true)
  })

  it('keeps session listeners when the global active registry is mutated', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources.food = 0
    player.resources.boar = 0
    player.minorPlayed.push(CARD_ID)

    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (!pigMarket) throw new Error('pig-market space missing')
    pigMarket.resources.boar = 2

    session.loadState(state)
    try {
      session.withCtx(() => getActiveCardRegistry()?.removeListenersWhere((listener) => listener.id === LISTENER_ID))
      let resp = session.takeAction(0, 'pig-market')
      expect(resp.ok).toBe(true)
      if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionAnimalReorg') {
        resp = session.resolveChoice(0, 'confirm', [
          { id: 'house:1-0', zoneType: 'house', animalType: 'boar', animalCount: 1 },
        ] as unknown as Record<string, unknown>)
      }
      expect(resp.state.players[0]!.resources.food).toBe(2)
    } finally {
      session.dispose()
    }
  })
})

/**
 * The reference C52 listens to **any** Gain event with `fromActionSpace`, summing
 * obtained PIG and emitting `gainNode([FOOD => N])`. Our previous
 * implementation only handled `pig-market` collect; we now match the reference by
   * listening to `phase: 'after', actions: ['gain','collect','receive']` and
   * inspecting action-space resource.moved boar events. AnimalMarket flow modification
 * (sheep+food / boar+food / pay-food→cattle xor) is NOT implemented since
 * we have no AnimalMarket action space — registered as §2.5.
 */
describe('C052_HuntsmansHat listener — generic boar-gain trigger (any space)', () => {
  const setupListenerContext = (
    actionId: string,
    spaceId: string,
    boarGained: number,
    result: ActionExecutionResult = { type: 'ok' },
  ) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.id = 'p1'
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)
    return { session, context: {
      actionHooks: session.actionHooks,
      state,
      player,
      space: { id: spaceId } as never,
      actionId,
      phase: 'after' as const,
      result,
      transactionEvents: boarGained > 0
        ? [moved({ resources: { boar: boarGained }, from: { kind: 'actionSpace', spaceId } })]
        : [],
    } as unknown as CardListenerContext }
  }

  it('triggers on pig-market collect (boar gained)', () => {


    const { session, context: ctx } = setupListenerContext('collect', 'pig-market', 2)
    const listener = findListener(session, LISTENER_ID)
    expect(listener).toBeDefined()
    const result = session.withCtx(() => executeCardListener(listener!, ctx))
    expect(result?.flow).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ food: 2 })
    expect(result!.sourceCard).toBe(CARD_ID)
  })

  it('triggers on a non-pig-market space when a boar is gained (reference generic behavior)', () => {

    const { session, context: ctx } = setupListenerContext('gain', 'forest', 1)
    const listener = findListener(session, LISTENER_ID)! // arbitrary space
    const result = session.withCtx(() => executeCardListener(listener, ctx))
    expect(result?.flow).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 1 })
  })

  it('triggers on receive action when a boar is gained', () => {

    const { session, context: ctx } = setupListenerContext('receive', 'some-space', 3)
    const listener = findListener(session, LISTENER_ID)!
    const result = session.withCtx(() => executeCardListener(listener, ctx))
    expect(result?.flow).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 3 })
  })

  it('does not trigger when no boar is gained', () => {

    const { session, context: ctx } = setupListenerContext('collect', 'forest', 0)
    const listener = findListener(session, LISTENER_ID)!
    const result = session.withCtx(() => executeCardListener(listener, ctx))
    expect(result).toBeUndefined()
  })

  it('does not read prior global state events when current transaction has no boar moves', () => {

    const { session, context: ctx } = setupListenerContext('collect', 'forest', 0, {
      type: 'ok',
      resourcesGained: { boar: 1 },
    } as ActionExecutionResult)
    const listener = findListener(session, LISTENER_ID)!
    ctx.state.events = [
      { type: 'worker.placed', actorPlayerId: 'p1', workerId: 'w1', spaceId: 'pig-market' } as never,
      moved() as never,
    ]

    const result = session.withCtx(() => executeCardListener(listener, ctx))

    expect(result).toBeUndefined()
  })

  it('does not trigger for card/source boar moves even when result claims boar gained', () => {

    const { session, context: ctx } = setupListenerContext('gain', 'card-source', 0, {
      type: 'ok',
      resourcesGained: { boar: 1 },
    } as ActionExecutionResult)
    const listener = findListener(session, LISTENER_ID)!
    ctx.transactionEvents = [
      moved({
        from: { kind: 'card', playerId: 'p1', cardId: 'OtherCard' },
        reason: 'cardEffect',
      }),
    ]
    const result = session.withCtx(() => executeCardListener(listener, ctx))
    expect(result).toBeUndefined()
  })

  it('does not trigger on irrelevant action ids', () => {

    const session = new GameSession(42)
    const listener = findListener(session, LISTENER_ID)!
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)
    const ctx = {
      state,
      player,
      space: { id: 'unrelated' } as never,
      actionId: 'plow',
      phase: 'after' as const,
      result: { type: 'ok', resourcesGained: { boar: 5 } } as ActionExecutionResult,
    } as unknown as CardListenerContext
    // Listener is filtered by `actions: ['gain','collect','receive']`, so
    // the dispatcher would never invoke it on plow. We simulate by checking
    // the configured actions list directly.
    expect(listener.actions).toBeDefined()
    expect(listener.actions).not.toContain('plow')
    // Even if forced through the handler, the action-id guard inside the
    // handler should prevent firing.
    const result = session.withCtx(() => executeCardListener(listener, ctx))
    expect(result).toBeUndefined()
  })
})

describe('ae-negative-37-food', () => {
  const { sessions, ok, options, save, setup, finish, next, take, move, prerequisites, hand, buy, pasture, printed, ownMajor, denyMinor } = audit37Food
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C052 N1 actual printed purchase pays exact cost and excludes unavailable resources', () => { const card = 'C052_HuntsmansHat', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); ownMajor(st, 'Major_Fireplace1'); Object.assign(st.players[0]!.resources, { "reed": 1 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 1); assert.equal(r.state.players[0]!.resources.reed, 0); save('C052-N1-legal', r); const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); ownMajor(st, 'Major_Fireplace1'); Object.assign(st.players[0]!.resources, { "reed": 0 }); }); denyMinor(t, card); save('C052-N1-short', t.getState()); const excluded = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { "reed": 1 }); }); denyMinor(excluded, card); save('C052-N1-prerequisite', excluded.getState()); });
  it('C052 N2 each new action space pig grants one food independent of quantity', () => {
      for (const n of [1, 3]) {
          const card = 'C052_HuntsmansHat', s = setup(card, 14, st => { ownMajor(st, 'Major_Fireplace1'); pasture(st, [{ row: 0, col: 3 }, { row: 0, col: 4 }]); st.actionSpaces.find(a => a.id === 'pig-market')!.resources.boar = n; });
          const r = finish(s, take(s, 'pig-market'), true);
          assert.equal(r.state.players[0]!.resources.boar, n);
          assert.equal(r.state.players[0]!.pastures[0]!.animalCount, n);
          assert.equal(r.state.players[0]!.resources.food, 40 + n);
          save(`C052-N2-${n}`, r);
      }
  });
  it('C052 N3 empty pile hand only opponent and nonpig gains exclude owner food', () => {
      for (const mode of ['empty', 'hand', 'opponent', 'sheep']) {
          const card = 'C052_HuntsmansHat', s = setup(card, 14, st => {
              ownMajor(st, 'Major_Fireplace1');
              pasture(st, [{ row: 0, col: 3 }]);
              st.actionSpaces.find(a => a.id === 'pig-market')!.resources.boar = mode === 'empty' ? 0 : 1;
              st.actionSpaces.find(a => a.id === 'sheep-market')!.resources.sheep = 1;
              if (mode === 'hand')
                  hand(st, card);
              if (mode === 'opponent')
                  st.currentPlayerIndex = 1;
          });
          const r = mode === 'empty' ? assertEmptyAccumulationRejected(s, 0, 'pig-market') : finish(s, take(s, mode === 'sheep' ? 'sheep-market' : 'pig-market'), true);
          assert.equal(r.state.players[0]!.resources.food, 40);
          save(`C052-N3-${mode}`, r);
      }
      const card = 'C052_HuntsmansHat', s = setup(card, 14, st => { hand(st, card); ownMajor(st, 'Major_Fireplace1'); st.players[0]!.resources.reed = 1; pasture(st, [{ row: 0, col: 3 }], 'sheep', 1); st.players[0]!.occupationPlayed = ['B104_SheepWalker']; });
      finish(s, buy(s, card));
      move(s, 'forest');
      next(s);
      let cardResult = ok(s.takeAnytimeAction(0, 'exchange'));
      const trade = options(cardResult).find(o => o.effectPreview?.kind === 'resourceExchange' && o.effectPreview.resourcesPaid?.sheep === 1 && o.effectPreview.resourcesGained?.boar === 1);
      assert.ok(trade);
      cardResult = finish(s, ok(s.resolveChoice(0, trade.value)), true);
      assert.equal(cardResult.state.players[0]!.resources.boar, 1);
      assert.equal(cardResult.state.players[0]!.resources.sheep, 0);
      assert.equal(cardResult.state.players[0]!.resources.food, 40);
      save('C052-N3-card-supplied', cardResult);
  });
})
