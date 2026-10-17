import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit35Future from './_helpers/audit/ae-negative-35-future'

describe('ae-negative-35-future', () => {
  const { sessions, save, finish, progress, buy, future, delayed, schedule } = audit35Future
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D041 N1 actual three occupation two wood purchase schedules food sheep and real following rounds deliver one food then one housed sheep', () => { const s = delayed('D041_HorseDrawnBoat'), bought = finish(s, buy(s, 'D041_HorseDrawnBoat')); assert.equal(bought.state.players[0]!.resources.wood, 0); assert.deepEqual(future(bought, 'D041_HorseDrawnBoat'), schedule(5, ['food', 'sheep'])); assert.equal(bought.state.players[0]!.resources.food, 100); const six = progress(s, 6), seven = progress(s, 7); assert.equal(six.state.players[0]!.resources.food, 101); assert.equal(seven.state.players[0]!.resources.sheep, 1); assert.equal(seven.state.players[0]!.pastures[0]!.animalCount, 1); save('D041-N1', { bought, six, seven }); });
  it('D041 N2 two occupations insufficient wood and a held card cannot schedule or grant its next round food', () => {
      const rows = [];
      for (const [eligible, pay] of [[false, true], [true, false]] as const) {
          const s = delayed('D041_HorseDrawnBoat', 5, false, eligible, pay), p = buy(s, 'D041_HorseDrawnBoat'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'D041_HorseDrawnBoat'));
          assert.ok(p.state.players[0]!.minorHand.includes('D041_HorseDrawnBoat'));
          assert.deepEqual(future(p, 'D041_HorseDrawnBoat'), []);
          rows.push({ p, bad });
      }
      const t = delayed('D041_HorseDrawnBoat'), hand = progress(t, 6);
      assert.equal(hand.state.players[0]!.resources.food, 100);
      save('D041-N2', { rows, hand });
  });
  it('D041 N3 late purchases keep only food sheep goods in remaining natural rounds and never create out of range delivery', () => {
      const rows = [];
      for (const round of [12, 13, 14] as const) {
          const s = delayed('D041_HorseDrawnBoat', round), r = finish(s, buy(s, 'D041_HorseDrawnBoat'));
          assert.deepEqual(future(r, 'D041_HorseDrawnBoat'), schedule(round, ['food', 'sheep']));
          rows.push(r);
      }
      save('D041-N3', rows);
  });
})
