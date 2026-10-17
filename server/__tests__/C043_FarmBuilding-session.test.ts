import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit36Native from './_helpers/audit/ae-negative-36-native'

describe('ae-negative-36-native', () => {
  const { sessions, traces, save, make, take, choose, opts, finish, ready, fill, end, final, minor, purchase, resource, future, points, major } = audit36Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("C043 N1 real purchase and an actual major build schedule three foods and naturally collect the first", () => { const s = make('C043_FarmBuilding', st => Object.assign(st.players[0]!.resources, { clay: 3, reed: 1 }), false), bought = purchase(s, 'C043_FarmBuilding'); resource(bought, { clay: 2, reed: 0, food: 100 }); assert.deepEqual(future(bought, 'C043_FarmBuilding'), []); fill(s); ready(s); const built = major(s, 'Major_Fireplace1'); resource(built, { clay: 0, food: 100 }); assert.deepEqual(future(built, 'C043_FarmBuilding'), [6, 7, 8]); const due = end(s); resource(due, { food: 101 }); assert.deepEqual(future(due, 'C043_FarmBuilding'), [7, 8]); save('C043-N1', { bought, built, due }); });
  it("C043 N2 minor purchase hand opponent and an unpayable major cannot schedule Farm Building food", () => { for (const mode of ['minor', 'hand', 'opponent']) {
      const a = mode === 'opponent' ? 1 : 0, s = make('C043_FarmBuilding', st => { st.currentPlayerIndex = a; Object.assign(st.players[a]!.resources, { clay: 2, reed: 1 }); }, mode !== 'hand'), r = mode === 'minor' ? finish(s, choose(s, 0, opts(minor(s)).find(o => o.value === 'B004_WoodPile')!.value), true, [], 'C043_FarmBuilding') : major(s, 'Major_Fireplace1', a);
      assert.deepEqual(future(r, 'C043_FarmBuilding'), []);
      save(`C043-N2-${mode}`, r);
  } const s = make('C043_FarmBuilding', st => { st.players[0]!.resources.clay = 1; }); let p = take(s, 0, 'major-improvement'); if (opts(p).some(o => o.value.startsWith('action-improvement-')))
      p = choose(s, 0, opts(p).find(o => o.value.startsWith('action-improvement-'))!.value); assert.equal(opts(p).some(o => o.value === 'Major_Fireplace1' && !('disabled' in o && o.disabled)), false); const bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'Major_Fireplace1')), r = finish(s, choose(s, 0, 'B004_WoodPile'), true, [], 'C043_FarmBuilding'); assert.deepEqual(future(r, 'C043_FarmBuilding'), []); save('C043-N2-cost', { p, bad, r }); });
  it("C043 N3 true minor-action majors repeated builds and final-round builds keep literal source and horizon", () => { const m = make('C043_FarmBuilding', st => { st.players[0]!.minorPlayed.push('C027_Blueprint'); Object.assign(st.players[0]!.resources, { wood: 2, stone: 1 }); }), p = minor(m), minorMajor = finish(m, choose(m, 0, 'Major_Joinery')); resource(minorMajor, { wood: 0, stone: 0 }); assert.deepEqual(future(minorMajor, 'C043_FarmBuilding'), [6, 7, 8]); save('C043-N3-minor', { p, minorMajor }); const s = make('C043_FarmBuilding', st => { st.players[0]!.resources.clay = 5; }), first = major(s, 'Major_Fireplace1'), six = end(s); resource(six, { food: 101 }); const second = major(s, 'Major_Fireplace2'); resource(second, { clay: 0 }); assert.deepEqual(future(second, 'C043_FarmBuilding'), [7, 7, 8, 8, 9]); const seven = end(s); resource(seven, { food: 103 }); save('C043-N3-repeat', { first, six, second, seven }); for (const round of [13, 14]) {
      const t = make('C043_FarmBuilding', st => { st.players[0]!.resources.clay = 2; }, true, round), r = major(t, 'Major_Fireplace1');
      assert.deepEqual(future(r, 'C043_FarmBuilding'), round === 13 ? [14] : []);
      const done = round === 13 ? end(t) : final(t);
      if (round === 13)
          resource(done, { food: 97 });
      else assert.equal(points(done,'C043_FarmBuilding'),1);
      save(`C043-N3-${round}`, { r, done });
  } });
})
