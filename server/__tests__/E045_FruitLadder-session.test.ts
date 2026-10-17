import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit36Native from './_helpers/audit/ae-negative-36-native'

describe('ae-negative-36-native', () => {
  const { sessions, traces, save, make, end, final, purchase, rejectBuy, resource, future, points } = audit36Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("E045 N1 real purchase schedules only remaining even rounds and naturally collects six then eight", () => { const s = make('E045_FruitLadder', st => { st.players[0]!.resources.wood = 2; }, false), r = purchase(s, 'E045_FruitLadder'); resource(r, { wood: 0 }); assert.deepEqual(future(r, 'E045_FruitLadder'), [6, 8, 10, 12, 14]); const six = end(s), seven = end(s), eight = end(s); resource(six, { food: 101 }); resource(seven, { food: 101 }); resource(eight, { food: 98 }); save('E045-N1', { r, six, seven, eight }); });
  it("E045 N2 missing wood and a held card cannot schedule even-round food", () => { save('E045-N2-cost', rejectBuy(make('E045_FruitLadder', st => { st.players[0]!.resources.wood = 1; }, false), 'E045_FruitLadder')); const s = make('E045_FruitLadder', st => { st.players[0]!.resources.wood = 2; }, false), r = end(s, true, [], 'E045_FruitLadder'); resource(r, { food: 100 }); assert.deepEqual(future(r, 'E045_FruitLadder'), []); save('E045-N2-hand', r); });
  it("E045 N3 current even rounds and final-round purchases are excluded from the future schedule", () => { for (const round of [6, 13, 14]) {
      const s = make('E045_FruitLadder', st => { st.players[0]!.resources.wood = 2; }, false, round), r = purchase(s, 'E045_FruitLadder');
      assert.deepEqual(future(r, 'E045_FruitLadder'), round === 6 ? [8, 10, 12, 14] : round === 13 ? [14] : []);
      resource(r, { food: 100 });
      const due = round === 13 ? end(s) : round === 14 ? final(s) : r;
      if (round === 13)
          resource(due, { food: 97 });
      if (round === 14)
          assert.equal(points(due, 'E045_FruitLadder'), 1);
      save(`E045-N3-${round}`, { r, due });
  } });
})
