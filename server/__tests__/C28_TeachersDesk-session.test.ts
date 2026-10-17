import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/C/C028_TeachersDesk'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import * as audit33Native from './_helpers/audit/ae-negative-33-native'

const CARD_ID = 'C028_TeachersDesk'

const findListener = (ruleOwner: SessionRuleOwner, id: string) =>
  ruleOwner.withCtx(() => getRegisteredCardListeners()).find((l) => l.id === id)

describe('C028_TeachersDesk session', () => {
  it('before-place-farmer on major-improvement offers optional occupation with 1 food cost', () => {


    const session = new GameSession(42)
    const listener = findListener(session, 'C28-teachers-desk-before-place-farmer')!
    expect(listener).toBeDefined()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationHand.push('C107_Baker')
    session.loadState(state)

    const space = state.actionSpaces.find((s) => s.id === 'major-improvement')!
    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('occupation')
    expect(leaf.optional).toBe(true)
    expect(leaf.params).toEqual({ exactCost: { food: 1 } })
    expect(leaf.sourceCard).toBe(CARD_ID)
  })

  it('before-place-farmer on house-redevelopment also triggers', () => {

    const session = new GameSession(42)
    const listener = findListener(session, 'C28-teachers-desk-before-place-farmer')!
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 3 // house-redevelopment becomes available by mid game
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationHand.push('C107_Baker')
    session.loadState(state)

    const space = state.actionSpaces.find((s) => s.id === 'house-redevelopment')
    if (!space) return
    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('occupation')
  })

  it('does not trigger when occupation hand is empty', () => {

    const session = new GameSession(42)
    const listener = findListener(session, 'C28-teachers-desk-before-place-farmer')!
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationHand = []
    session.loadState(state)

    const space = state.actionSpaces.find((s) => s.id === 'major-improvement')!
    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))
    expect(result).toBeUndefined()
  })

  it('does not trigger on other spaces', () => {

    const session = new GameSession(42)
    const listener = findListener(session, 'C28-teachers-desk-before-place-farmer')!
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationHand.push('C107_Baker')
    session.loadState(state)

    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'place-farmer',
      phase: 'before',
    } as unknown as CardListenerContext))
    expect(result).toBeUndefined()
  })

})

describe('ae-negative-33-native', () => {
  const { sessions, traces, save, make, take, finish, purchase, rejectBuy, undo, resource, occupied, occupations } = audit33Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("C028 N1 real purchase and both printed spaces play one extra occupation for exactly one food before their host", () => { const b = make('C028_TeachersDesk', st => { occupations(st.players[0]!, 1); st.players[0]!.resources.wood = 1; }, false), bought = purchase(b, 'C028_TeachersDesk'), u = undo(b); resource(bought, { wood: 0 }); for (const space of ['major-improvement', 'house-redevelopment']) {
      const s = make('C028_TeachersDesk', st => { occupations(st.players[0]!, 1); Object.assign(st.players[0]!.resources, { clay: 2, reed: 1 }); }, true, 6), p = take(s, 0, space), r = finish(s, p, true, ['A125_Priest', 'Major_Fireplace1', 'clay']);
      resource(r, { food: 99, clay: 0 });
      assert.ok(r.state.players[0]!.occupationPlayed.includes('A125_Priest'));
      assert.equal(occupied(r).length, 1);
      if (space === 'major-improvement')
          assert.ok(r.state.players[0]!.improvements.includes('Major_Fireplace1'));
      else
          assert.equal(r.state.players[0]!.houseType, 'clay');
      save(`C028-N1-${space}`, { bought, u, p, r });
  } });
  it("C028 N2 occupation prerequisite wood shortage zero food and genuine decline prevent the extra play", () => { for (const mode of ['occupation', 'wood']) {
      const s = make('C028_TeachersDesk', st => { occupations(st.players[0]!, mode === 'occupation' ? 0 : 1); st.players[0]!.resources.wood = mode === 'wood' ? 0 : 1; }, false);
      save(`C028-N2-${mode}`, rejectBuy(s, 'C028_TeachersDesk'));
  } for (const decline of [false, true]) {
      const s = make('C028_TeachersDesk', st => { occupations(st.players[0]!, 1); Object.assign(st.players[0]!.resources, { clay: 2, food: decline ? 1 : 0 }); }, true, 6), p = take(s, 0, 'major-improvement'), r = finish(s, p, !decline, ['Major_Fireplace1'], decline ? undefined : 'C028_TeachersDesk');
      assert.ok(r.state.players[0]!.occupationHand.includes('A125_Priest'));
      resource(r, { food: decline ? 1 : 0 });
      assert.ok(r.state.players[0]!.improvements.includes('Major_Fireplace1'));
      save(`C028-N2-${decline ? 'decline' : 'food'}`, { p, r });
  } });
  it("C028 N3 held card foreign placement unrelated space and no playable hand exclude the extra occupation", () => { for (const mode of ['hand', 'opponent', 'unrelated', 'empty']) {
      const a = mode === 'opponent' ? 1 : 0, s = make('C028_TeachersDesk', st => { st.currentPlayerIndex = a; occupations(st.players[0]!, 1); st.players[a]!.resources.clay = 2; if (mode === 'empty')
          st.players[0]!.occupationHand = ['__test_placeholder__']; }, mode !== 'hand', 6), r = finish(s, take(s, a, mode === 'unrelated' ? 'grain-seeds' : 'major-improvement'), true, ['Major_Fireplace1'], 'C028_TeachersDesk');
      assert.equal(r.state.players[0]!.occupationPlayed.length, 1);
      resource(r, { food: 100 });
      save(`C028-N3-${mode}`, r);
  } });
})
