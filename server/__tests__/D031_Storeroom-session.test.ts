import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit33Native from './_helpers/audit/ae-negative-33-native'

describe('ae-negative-33-native', () => {
  const { sessions, traces, save, make, final, purchase, rejectBuy, undo, resource, bonus, points, field } = audit33Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("D031 N1 real purchase pays one wood and two stone and rejects either shortage before undo", () => { for (const mode of ['wood', 'stone']) {
      const s = make('D031_Storeroom', st => Object.assign(st.players[0]!.resources, { wood: mode === 'wood' ? 0 : 1, stone: mode === 'stone' ? 1 : 2 }), false);
      save(`D031-N1-${mode}`, rejectBuy(s, 'D031_Storeroom'));
  } const s = make('D031_Storeroom', st => Object.assign(st.players[0]!.resources, { wood: 1, stone: 2 }), false, 14), r = purchase(s, 'D031_Storeroom'), u = undo(s), scored = (purchase(s, 'D031_Storeroom'), final(s)); resource(r, { wood: 0, stone: 0 }); resource(u, { wood: 1, stone: 2 }); assert.equal(points(scored, 'D031_Storeroom'), 1); save('D031-N1', { r, u, scored }); });
  it("D031 N2 actual final scoring rounds half the reserve crop pairs upward and ignores excess unmatched crops", () => { for (const [n, expected] of [[0, 0], [1, 1], [2, 1], [3, 2], [4, 2], [5, 3]]) {
      const s = make('D031_Storeroom', st => Object.assign(st.players[0]!.resources, { grain: n, vegetable: n! + 2 }), true, 14), r = final(s);
      resource(r, { grain: n, vegetable: n! + 2 });
      assert.equal(bonus(r, 'D031_Storeroom'), expected);
      save(`D031-N2-${n}`, r);
  } });
  it("D031 N3 field and reserve crops combine through a real harvest while held Storeroom scores nothing", () => { for (const held of [false, true]) {
      const s = make('D031_Storeroom', st => { field(st.players[0]!, 3, 2); Object.assign(st.players[0]!.resources, { grain: 2, vegetable: 1 }); }, !held, 14), r = final(s);
      resource(r, { grain: 3, vegetable: 2 });
      assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining, 2);
      assert.equal(r.state.players[0]!.fields[1]!.stacks[0]!.remaining, 1);
      assert.equal(bonus(r, 'D031_Storeroom'), held ? 0 : 2);
      save(`D031-N3-${held}`, r);
  } });
})
