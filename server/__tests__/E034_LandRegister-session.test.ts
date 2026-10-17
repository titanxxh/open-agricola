import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit34Scoring from './_helpers/audit/ae-negative-34-scoring'

describe('ae-negative-34-scoring', () => {
  const { sessions, ok, save, setup, prerequisites, hand, buy, bonus, printed, fields, finishGame, denyMinor, fillFarm } = audit34Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E034 N1 real printed purchase pays exact cost and excludes insufficient resources or prerequisite', () => { const card = 'E034_LandRegister', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { food: 40, wood: 1 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); assert.equal(r.state.players[0]!.resources.wood, 0); save('E034-N1-legal', r); {
      const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); st.players[0]!.houseType = 'wood'; Object.assign(st.players[0]!.resources, { food: 40, wood: 0 }); });
      const q = denyMinor(t, card);
      assert.equal(printed(q, card), 0);
      save('E034-N1-resource', q);
  } });
  it('E034 N2 full fifteen tile coverage scores two and a stable inside a pasture cannot fill a missing tile', () => { for (const full of [true, false]) {
      const card = 'E034_LandRegister', s = setup(card, 14, st => fillFarm(st, full));
      let r = ok(s.getState());
      assert.equal(bonus(r, card), full ? 2 : 0);
      assert.equal(r.state.players[0]!.fields.length, full ? 11 : 10);
      r = finishGame(s);
      assert.equal(bonus(r, card), full ? 2 : 0);
      save(`E034-N2-${full}`, r);
  } });
  it('E034 N3 all fields can fill the farm while hand-only card gives no completion bonus', () => { for (const played of [true, false]) {
      const card = 'E034_LandRegister', s = setup(card, 14, st => { fields(st, 13); if (!played)
          hand(st, card); });
      const r = ok(s.getState());
      assert.equal(bonus(r, card), played ? 2 : 0);
      assert.equal(r.state.players[0]!.fields.length, 13);
      save(`E034-N3-${played}`, r);
  } });
})
