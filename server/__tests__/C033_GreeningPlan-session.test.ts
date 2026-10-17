import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit34Scoring from './_helpers/audit/ae-negative-34-scoring'

describe('ae-negative-34-scoring', () => {
  const { sessions, ok, save, setup, prerequisites, hand, buy, bonus, printed, fields, finishGame, denyMinor } = audit34Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C033 N1 real printed purchase pays exact cost and excludes insufficient resources or prerequisite', () => { const card = 'C033_GreeningPlan', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { food: 3 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); assert.equal(r.state.players[0]!.resources.food, 0); save('C033-N1-legal', r); {
      const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); st.players[0]!.houseType = 'wood'; Object.assign(st.players[0]!.resources, { food: 2 }); });
      const q = denyMinor(t, card);
      assert.equal(printed(q, card), 0);
      save('C033-N1-resource', q);
  } });
  it('C033 N2 unplanted field thresholds score literal zero through five without counting planted fields', () => { for (const [n, expected] of [[0, 0], [1, 0], [2, 1], [3, 1], [4, 2], [5, 3], [6, 5]] as const) {
      const card = 'C033_GreeningPlan', s = setup(card, 14, st => fields(st, n));
      const r = ok(s.getState());
      assert.equal(bonus(r, card), expected);
      assert.equal(bonus(ok(s.getState()), card), expected);
      save(`C033-N2-${n}`, r);
  } const s = setup('C033_GreeningPlan', 14, st => fields(st, 6, [{ kind: 'grain', remaining: 3 }, { kind: 'vegetable', remaining: 2 }, { kind: 'grain', remaining: 1 }])); const r = ok(s.getState()); assert.equal(bonus(r, 'C033_GreeningPlan'), 1); save('C033-N2-planted', r); });
  it('C033 N3 actual final harvest empties its last crop before bonus scoring while hand-only card stays absent', () => { for (const played of [true, false]) {
      const card = 'C033_GreeningPlan', s = setup(card, 14, st => { fields(st, 2, [{ kind: 'grain', remaining: 1 }]); if (!played)
          hand(st, card); });
      assert.equal(bonus(ok(s.getState()), card), 0);
      const r = finishGame(s);
      assert.equal(bonus(r, card), played ? 1 : 0);
      assert.deepEqual(r.state.players[0]!.fields.map(f => f.stacks), [[], []]);
      save(`C033-N3-${played}`, r);
  } });
})
