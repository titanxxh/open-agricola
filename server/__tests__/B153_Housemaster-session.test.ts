import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit30Native from './_helpers/audit/ae-negative-30-native'

describe('ae-negative-30-native', () => {
  const { sessions, commands, save, make, finish, play, final, bonus } = audit30Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); commands.splice(0); });
  it('B153 N1 real purchase reaches final scoring and doubles the smallest major base value', () => { const s = make('B153_Housemaster', st => { st.players[0]!.improvements = ['Major_Well', 'Major_Fireplace1']; st.availableMajorImprovements = st.availableMajorImprovements.filter(c => !st.players[0]!.improvements.includes(c)); }, false, 14), bought = finish(s, play(s, 'B153_Housemaster')), r = final(s); assert.equal(r.state.gameOver, true); assert.equal(bonus(r, 'B153_Housemaster'), 1); save('B153-N1', { bought, r }); });
  it('B153 N2 actual final scoring honors zero and all four bonus thresholds', () => { for (const [majors, expected] of [[[], 0], [['Major_Fireplace1'], 0], [['Major_Joinery', 'Major_Fireplace1', 'Major_Fireplace2'], 1], [['Major_Well', 'Major_Fireplace1', 'Major_Fireplace2'], 2], [['Major_Well', 'Major_Joinery', 'Major_Fireplace1', 'Major_Fireplace2'], 3], [['Major_Well', 'Major_Joinery', 'Major_Pottery', 'Major_Fireplace1', 'Major_Fireplace2'], 4], [['Major_Well', 'Major_Joinery', 'Major_Pottery', 'Major_Basket'], 4]] satisfies Array<[
      string[],
      number
  ]>) {
      const s = make('B153_Housemaster', st => { st.players[0]!.improvements = majors; st.availableMajorImprovements = st.availableMajorImprovements.filter(c => !majors.includes(c)); }, true, 14), r = final(s);
      assert.equal(bonus(r, 'B153_Housemaster'), expected);
      save(`B153-N2-${majors.length}-${expected}`, r);
  } });
  it('B153 N3 minor points opponent majors and held occupation are excluded at actual final scoring', () => { for (const held of [false, true]) {
      const s = make('B153_Housemaster', st => { if (held)
          st.players[0]!.improvements = ['Major_Well'];
      else {
          st.players[0]!.minorPlayed = ['B068_Beanfield'];
          st.players[1]!.improvements = ['Major_Well'];
      } st.availableMajorImprovements = st.availableMajorImprovements.filter(c => c !== 'Major_Well'); }, !held, 14), r = final(s);
      assert.equal(bonus(r, 'B153_Housemaster'), 0);
      save(`B153-N3-${held}`, r);
  } });
})
