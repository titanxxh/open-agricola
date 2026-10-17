import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { getStoredResource } from '../../shared/cards/helpers/card-storage'
import * as audit34Scoring from './_helpers/audit/ae-negative-34-scoring'

describe('ae-negative-34-scoring', () => {
  const { sessions, save, setup, choose, finish, improvement, offer, take, prerequisites, hand, buy, noSource, accept, bonus, printed, laterMinor, upholsterySequence } = audit34Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E031 N1 real printed purchase pays exact cost and excludes insufficient resources or prerequisite', () => { const card = 'E031_Upholstery', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { food: 40 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); save('E031-N1-legal', r); });
  it('E031 N2 actual successive improvements store reed irretrievably and stop at the two room cap', () => { for (const rooms of [2, 3]) {
      const { s, r } = upholsterySequence(rooms), card = 'E031_Upholstery';
      assert.equal(bonus(r, card), rooms);
      assert.equal(r.state.players[0]!.resources.reed, 3 - rooms);
      assert.equal(getStoredResource(r.state.players[0]!, card, 'reed'), rooms);
      assert.equal(r.state.players[0]!.rooms, rooms);
      assert.equal(getStoredResource(s.getState().state.players[0]!, card, 'reed'), rooms);
      save(`E031-N2-${rooms}`, r);
  } });
  it('E031 N3 decline missing reed hand-only and opponent improvement cannot create stored points', () => { for (const mode of ['decline', 'zero', 'hand', 'opponent']) {
      const card = 'E031_Upholstery', s = setup(card, 14, st => { st.players[0]!.resources.reed = mode === 'zero' ? 0 : 1; st.players[0]!.minorHand = ['E050_WildGreens']; if (mode === 'hand') {
          st.players[0]!.minorPlayed = [];
          st.players[0]!.minorHand.push(card);
      } if (mode === 'opponent') {
          st.currentPlayerIndex = 1;
          st.players[1]!.minorHand = ['E050_WildGreens'];
          st.players[0]!.minorHand = ['__test_placeholder__'];
      } });
      let r = laterMinor(s, 'E050_WildGreens');
      if (mode === 'decline')
          r = choose(s, offer(s, r, card), o => o.value === '__skip__');
      else
          noSource(r, card);
      r = finish(s, r, true);
      assert.equal(bonus(r, card), 0);
      assert.equal(getStoredResource(r.state.players[0]!, card, 'reed'), 0);
      assert.equal(r.state.players[0]!.resources.reed, mode === 'zero' ? 0 : 1);
      save(`E031-N3-${mode}`, r);
  } });
  it('E031 N4 a real major improvement also allows storing exactly one reed', () => { const card = 'E031_Upholstery', s = setup(card, 14, st => { st.players[0]!.resources.reed = 1; st.players[0]!.resources.clay = 2; }); let r = improvement(s, take(s, 'major-improvement'), 'Major_Fireplace1'); r = finish(s, accept(s, r, card), true); assert.equal(r.state.players[0]!.resources.clay, 0); assert.equal(r.state.players[0]!.resources.reed, 0); assert.equal(getStoredResource(r.state.players[0]!, card, 'reed'), 1); assert.equal(bonus(r, card), 1); save('E031-N4', r); });
})
