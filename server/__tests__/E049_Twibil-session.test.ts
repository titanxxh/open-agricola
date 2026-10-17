import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit37Food from './_helpers/audit/ae-negative-37-food'

describe('ae-negative-37-food', () => {
  const { sessions, save, setup, finish, take, prerequisites, hand, buy, printed, house, denyMinor, buildRooms } = audit37Food
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E049 N1 actual printed purchase pays exact cost and excludes unavailable resources', () => { const card = 'E049_Twibil', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { "stone": 1 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 1); assert.equal(r.state.players[0]!.resources.stone, 0); save('E049-N1-legal', r); const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { "stone": 0 }); }); denyMinor(t, card); save('E049-N1-short', t.getState()); });
  it('E049 N2 one or two actual wooden rooms by either player award exactly one owner food', () => {
      for (const [n, opponent] of [[1, false], [2, false], [1, true]] as const) {
          const card = 'E049_Twibil', s = setup(card, 14, st => {
              const p = st.players[opponent ? 1 : 0]!;
              Object.assign(p.resources, { wood: 5 * n, reed: 2 * n });
              if (opponent)
                  st.currentPlayerIndex = 1;
          });
          const r = finish(s, buildRooms(s, n), true);
          assert.equal(r.state.players[opponent ? 1 : 0]!.rooms, 2 + n);
          assert.equal(r.state.players[0]!.resources.food, 41);
          assert.equal(r.state.players[opponent ? 1 : 0]!.resources.wood, 0);
          save(`E049-N2-${n}-${opponent}`, r);
      }
  });
  it('E049 N3 clay or stone rooms hand only and unrelated farming exclude the wooden room reward', () => {
      for (const mode of ['clay', 'stone', 'hand', 'unrelated']) {
          const card = 'E049_Twibil', s = setup(card, 14, st => {
              if (mode === 'clay' || mode === 'stone')
                  house(st, 2, mode);
              if (mode === 'hand')
                  hand(st, card);
              Object.assign(st.players[0]!.resources, { wood: 5, clay: 5, stone: 5, reed: 2 });
          });
          const r = finish(s, mode === 'unrelated' ? take(s, 'grain-seeds') : buildRooms(s), false);
          assert.equal(r.state.players[0]!.resources.food, 40);
          save(`E049-N3-${mode}`, r);
      }
  });
})
