import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit40Crops from './_helpers/audit/ae-negative-40-crops'

describe('ae-negative-40-crops', () => {
  const { sessions, save, setup, finish, completeRound, hand, buy, noSource, printed, fields, denyMinor } = audit40Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C066 N1 actual hand purchase pays printed cost and meets each prerequisite', () => { const card = 'C066_EternalRyeCultivation'; const s = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, {}); fields(st, 1, [{ kind: "grain", remaining: 3 }]); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); save("C066-N1-legal", r); const excluded = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, {}); fields(st, 1); }); denyMinor(excluded, card); save("C066-N1-prerequisite", excluded.getState()); });
  it('C066 N2 natural harvest checks the grain supply after reaping and grants exact boundary bonus', () => { for (const [initial, expected] of [[0, 1], [1, 2], [2, 4], [4, 6]]) {
      const card = 'C066_EternalRyeCultivation', s = setup(card, 7, st => { fields(st, 1, [{ kind: 'grain', remaining: 1 }]); st.players[0]!.resources.grain = initial!; });
      const r = finish(s, completeRound(s, ['clay-pit', 'forest', 'reed-bank', 'fishing']));
      assert.equal(r.state.round, 8);
      assert.equal(r.state.players[0]!.resources.grain, expected);
      assert.equal(r.state.players[0]!.resources.food, initial === 1 ? 37 : 36);
      assert.equal(r.state.players[0]!.resources.begging, 0);
      save(`C066-N2-${initial}`, r);
  } });
  it('C066 N3 hand and nonharvest cannot create the postharvest reward', () => { for (const mode of ['hand', 'nonharvest']) {
      const card = 'C066_EternalRyeCultivation', s = setup(card, mode === 'hand' ? 7 : 6, st => { fields(st, 1, [{ kind: 'grain', remaining: 1 }]); st.players[0]!.resources.grain = 2; if (mode === 'hand')
          hand(st, card); });
      const r = finish(s, completeRound(s, ['clay-pit', 'forest', 'reed-bank', 'fishing']));
      assert.equal(r.state.players[0]!.resources.grain, mode === 'hand' ? 3 : 2);
      assert.equal(r.state.players[0]!.resources.food, mode === 'hand' ? 36 : 40);
      noSource(r, card);
      save(`C066-N3-${mode}`, r);
  } });
})
