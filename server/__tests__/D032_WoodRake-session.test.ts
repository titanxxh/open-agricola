import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit34Scoring from './_helpers/audit/ae-negative-34-scoring'

describe('ae-negative-34-scoring', () => {
  const { sessions, ok, save, setup, finish, completeRound, prerequisites, hand, buy, bonus, printed, fields, finishGame, denyMinor } = audit34Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D032 N1 real printed purchase pays exact cost and excludes insufficient resources or prerequisite', () => { const card = 'D032_WoodRake', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { food: 40, wood: 1 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); assert.equal(r.state.players[0]!.resources.wood, 0); save('D032-N1-legal', r); {
      const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); st.players[0]!.houseType = 'wood'; Object.assign(st.players[0]!.resources, { food: 40, wood: 0 }); });
      const q = denyMinor(t, card);
      assert.equal(printed(q, card), 0);
      save('D032-N1-resource', q);
  } });
  it('D032 N2 seven crop goods before final harvest award two even when harvest removes the threshold', () => { for (const [n, expected] of [[6, 0], [7, 2], [8, 2]] as const) {
      const card = 'D032_WoodRake', s = setup(card, 14, st => fields(st, 3, [{ kind: 'grain', remaining: 3 }, { kind: 'grain', remaining: n - 5 }, { kind: 'vegetable', remaining: 2 }]));
      assert.equal(bonus(ok(s.getState()), card), 0);
      const r = finishGame(s);
      assert.equal(bonus(r, card), expected);
      assert.equal(r.state.players[0]!.fields.reduce((n, f) => n + f.stacks.reduce((n, a) => n + a.remaining, 0), 0), n - 3);
      assert.equal(bonus(ok(s.getState()), card), expected);
      save(`D032-N2-${n}`, r);
  } });
  it('D032 N3 earlier harvest hand-only and opponent crops cannot satisfy the final before harvest condition', () => { for (const mode of ['earlier', 'hand', 'opponent']) {
      const card = 'D032_WoodRake', s = setup(card, mode === 'earlier' ? 13 : 14, st => { fields(st, 3, [{ kind: 'grain', remaining: 3 }, { kind: 'grain', remaining: 2 }, { kind: 'vegetable', remaining: 2 }]); if (mode === 'hand')
          hand(st, card); if (mode === 'opponent') {
          st.players[1]!.fields = st.players[0]!.fields;
          st.players[0]!.fields = [];
      } });
      let r = finish(s, completeRound(s), true);
      assert.equal(bonus(r, card), 0);
      if (mode === 'earlier') {
          assert.equal(r.state.round, 14);
          r = finishGame(s);
          assert.equal(bonus(r, card), 0);
      }
      save(`D032-N3-${mode}`, r);
  } });
})
