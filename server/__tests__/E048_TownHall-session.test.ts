import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit37Food from './_helpers/audit/ae-negative-37-food'

describe('ae-negative-37-food', () => {
  const { sessions, save, setup, finish, completeRound, prerequisites, hand, buy, printed, house, denyMinor } = audit37Food
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E048 N1 actual printed purchase pays exact cost and excludes unavailable resources', () => { const card = 'E048_TownHall', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { "wood": 2, "clay": 2 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 2); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.clay, 0); save('E048-N1-legal', r); const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { "wood": 1, "clay": 2 }); }); denyMinor(t, card); save('E048-N1-short', t.getState()); });
  it('E048 N2 real harvest food arrives before feeding and covers the exact clay or stone house shortage', () => {
      for (const type of ['wood', 'clay', 'stone'] as const) {
          const card = 'E048_TownHall', s = setup(card, 9, st => { house(st, 2, type); st.players[0]!.resources.food = type === 'clay' ? 3 : type === 'stone' ? 2 : 4; });
          const r = finish(s, completeRound(s, ['clay-pit', 'forest', 'reed-bank', 'grain-seeds']), true);
          assert.equal(r.state.round, 10);
          assert.equal(r.state.players[0]!.resources.food, 0);
          assert.equal(r.state.players[0]!.resources.begging, 0);
          save(`E048-N2-${type}`, r);
      }
  });
  it('E048 N3 hand only and a real nonharvest round cannot provide the feeding reward', () => {
      for (const mode of ['hand', 'nonharvest']) {
          const card = 'E048_TownHall', s = setup(card, mode === 'hand' ? 9 : 10, st => {
              house(st, 2, 'stone');
              if (mode === 'hand')
                  hand(st, card);
              st.players[0]!.resources.food = 4;
          });
          const r = finish(s, completeRound(s, ['clay-pit', 'forest', 'reed-bank', 'grain-seeds']), true);
          assert.equal(r.state.players[0]!.resources.food, mode === 'hand' ? 0 : 4);
          assert.equal(r.state.players[0]!.resources.begging, 0);
          save(`E048-N3-${mode}`, r);
      }
  });
})
