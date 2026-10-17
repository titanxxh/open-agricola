import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import type { SessionResponse } from '../game/authoritative-session'
import * as audit36Native from './_helpers/audit/ae-negative-36-native'

describe('ae-negative-36-native', () => {
  const { sessions, traces, save, make, end, final, purchase, rejectBuy, resource, future, points } = audit36Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("D043 N1 real purchase naturally pays zero one two and three food on the four consecutive starts", () => { const s = make('D043_Hutch', st => Object.assign(st.players[0]!.resources, { wood: 1, reed: 1 }), false), r = purchase(s, 'D043_Hutch'); resource(r, { wood: 0, reed: 0 }); assert.deepEqual(future(r, 'D043_Hutch'), [7, 8, 8, 9, 9, 9]); const six = end(s), seven = end(s), eight = end(s), nine = end(s); resource(six, { food: 100 }); resource(seven, { food: 101 }); resource(eight, { food: 99 }); resource(nine, { food: 102 }); assert.deepEqual(future(nine, 'D043_Hutch'), []); save('D043-N1', { r, six, seven, eight, nine }); });
  it("D043 N2 wood or reed shortages and a held card cannot obtain Hutch food", () => { for (const mode of ['wood', 'reed'])
      save(`D043-N2-${mode}`, rejectBuy(make('D043_Hutch', st => Object.assign(st.players[0]!.resources, { wood: mode === 'wood' ? 0 : 1, reed: mode === 'reed' ? 0 : 1 }), false), 'D043_Hutch')); const s = make('D043_Hutch', st => Object.assign(st.players[0]!.resources, { wood: 1, reed: 1 }), false), r = end(s, true, [], 'D043_Hutch'); resource(r, { food: 100 }); assert.deepEqual(future(r, 'D043_Hutch'), []); save('D043-N2-hand', r); });
  it("D043 N3 late purchases preserve the zero first slot and discard foods beyond the final round", () => { for (const round of [12, 13, 14]) {
      const s = make('D043_Hutch', st => Object.assign(st.players[0]!.resources, { wood: 1, reed: 1 }), false, round), r = purchase(s, 'D043_Hutch');
      assert.deepEqual(future(r, 'D043_Hutch'), round === 12 ? [14] : []);
      let thirteen: SessionResponse | undefined, due: SessionResponse;
      if (round === 12) {
          thirteen = end(s);
          resource(thirteen, { food: 100 });
          due = end(s);
          resource(due, { food: 97 });
      }
      else if (round === 13) {
          due = end(s);
          resource(due, { food: 96 });
      }
      else {
          due = final(s);
          assert.equal(points(due, 'D043_Hutch'), 1);
      }
      save(`D043-N3-${round}`, { r, thirteen, due });
  } });
})
