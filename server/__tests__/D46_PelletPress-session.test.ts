import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import '../../shared/cards/D/D046_PelletPress'
import type { FutureMeeple } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit36Native from './_helpers/audit/ae-negative-36-native'

describe('D046_PelletPress session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3
    const player = state.players[0]!
    player.resources.clay = 2
    player.resources.reed = 3
    player.resources.food = 0
    // Directly place card
    player.minorPlayed.push('D046_PelletPress')
    session.loadState(state)
    return session
  }

  it('pay 1 reed → 4 future food entries, flagged', () => {
    const session = setup()
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    const resp2 = session.takeAnytimeAction(0, 'D46-pellet-press-anytime')
    expect(resp2.ok).toBe(true)
    const p = resp2.state.players[0]!
    expect(p.resources.reed).toBe(2)
    expect(isCardFlagged(p, 'D046_PelletPress')).toBe(true)
    const fm = resp2.state.futureMeeples?.filter((m: FutureMeeple) => m.cardId === 'D046_PelletPress')
    expect(fm).toHaveLength(4)
    expect(fm![0].round).toBe(4)
    expect(fm![1].round).toBe(5)
    expect(fm![2].round).toBe(6)
    expect(fm![3].round).toBe(7)
  })

  it('not available without reed', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.resources.reed = 0
    session.loadState(state)
    const resp = session.takeAction(0, 'farmland')
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('D46-pellet-press-anytime')
  })
})

describe('ae-negative-36-native', () => {
  const { sessions, traces, save, make, finish, ready, fill, end, final, purchase, rejectBuy, resource, future, occupied, occupations, plow, anytime } = audit36Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("D046 N1 real purchase and two genuine rounds of paid anytime actions respect reset and stacking", () => { const s = make('D046_PelletPress', st => { occupations(st.players[0]!, 2); Object.assign(st.players[0]!.resources, { clay: 2, reed: 2 }); }, false), bought = purchase(s, 'D046_PelletPress'); resource(bought, { clay: 0 }); fill(s); ready(s); const p = plow(s), first = anytime(s, 'D46-pellet-press-anytime'); resource(first, { reed: 1 }); assert.deepEqual(future(first, 'D046_PelletPress'), [6, 7, 8, 9]); finish(s, first); const six = end(s); resource(six, { food: 101 }); const p6 = plow(s), second = anytime(s, 'D46-pellet-press-anytime'); resource(second, { reed: 0 }); assert.deepEqual(future(second, 'D046_PelletPress'), [7, 7, 8, 8, 9, 9, 10]); save('D046-N1', { bought, p, first, six, p6, second, r: finish(s, second) }); });
  it("D046 N2 purchase prerequisites reed shortage held card foreign actor and duplicate use block another payment", () => { for (const mode of ['occupation', 'clay'])
      save(`D046-N2-buy-${mode}`, rejectBuy(make('D046_PelletPress', st => { occupations(st.players[0]!, mode === 'occupation' ? 1 : 2); st.players[0]!.resources.clay = mode === 'clay' ? 1 : 2; }, false), 'D046_PelletPress')); const s = make('D046_PelletPress', st => { st.players[0]!.resources.reed = 2; }), p = plow(s), used = anytime(s, 'D46-pellet-press-anytime'), bad = assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, 'D46-pellet-press-anytime')); resource(used, { reed: 1 }); assert.deepEqual(future(used, 'D046_PelletPress'), [6, 7, 8, 9]); save('D046-N2-repeat', { p, used, bad, r: finish(s, used) }); for (const mode of ['reed', 'hand', 'opponent']) {
      const a = mode === 'opponent' ? 1 : 0, t = make('D046_PelletPress', st => { st.currentPlayerIndex = a; occupations(st.players[0]!, 2); Object.assign(st.players[0]!.resources, { clay: 2, reed: mode === 'reed' ? 0 : 1 }); }, mode !== 'hand'), before = plow(t, a, 'D046_PelletPress');
      assert.equal(before.interaction.anytimeActions.some(x => x.id === 'D46-pellet-press-anytime'), false);
      const rejected = assertRejectedUnchanged(t, () => t.takeAnytimeAction(a, 'D46-pellet-press-anytime')), r = finish(t, before, true, [], 'D046_PelletPress');
      assert.deepEqual(future(r, 'D046_PelletPress'), []);
      save(`D046-N2-${mode}`, { before, rejected, r });
  } });
  it("D046 N3 late paid Pellet Press uses schedule only reachable food without spending a person", () => { for (const round of [13, 14]) {
      const s = make('D046_PelletPress', st => { st.players[0]!.resources.reed = 1; }, true, round), p = plow(s), used = anytime(s, 'D46-pellet-press-anytime');
      resource(used, { reed: 0 });
      assert.deepEqual(future(used, 'D046_PelletPress'), round === 13 ? [14] : []);
      const r = finish(s, used);
      assert.equal(occupied(r).length, 1);
      const due = round === 13 ? end(s) : final(s);
      if (round === 13)
          resource(due, { food: 97 });
      save(`D046-N3-${round}`, { p, used, r, due });
  } });
})
