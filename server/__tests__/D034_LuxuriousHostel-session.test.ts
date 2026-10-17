import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { familySize } from '../../shared/domain/player'
import * as audit34Scoring from './_helpers/audit/ae-negative-34-scoring'

describe('ae-negative-34-scoring', () => {
  const { sessions, ok, save, setup, prerequisites, hand, buy, bonus, printed, finishGame, house, denyMinor, setPeople } = audit34Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D034 N1 real printed purchase pays exact cost and excludes insufficient resources or prerequisite', () => { const card = 'D034_LuxuriousHostel', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { food: 40, wood: 1, clay: 2 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.clay, 0); save('D034-N1-legal', r); {
      const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); st.players[0]!.houseType = 'wood'; Object.assign(st.players[0]!.resources, { food: 40, wood: 0, clay: 2 }); });
      const q = denyMinor(t, card);
      assert.equal(printed(q, card), 0);
      save('D034-N1-resource', q);
  } });
  it('D034 N2 more stone rooms than people is a strict scoring condition', () => { for (const [rooms, people, type, expected] of [[2, 2, 'stone', 0], [3, 2, 'stone', 4], [3, 3, 'stone', 0], [3, 2, 'clay', 0], [3, 2, 'wood', 0]] as const) {
      const card = 'D034_LuxuriousHostel', s = setup(card, 14, st => { house(st, rooms, type); setPeople(st, people); });
      const r = ok(s.getState());
      assert.equal(bonus(r, card), expected);
      assert.equal(familySize(r.state.players[0]!), people);
      save(`D034-N2-${rooms}-${people}-${type}`, r);
  } });
  it('D034 N3 only the larger stone house bonus scores and a tie still awards one card', () => { for (const [rooms, expected, c34] of [[3, 4, 4], [4, 4, undefined], [5, 5, 0]] as const) {
      const card = 'D034_LuxuriousHostel', s = setup(card, 14, st => { house(st, rooms, 'stone'); st.players[0]!.minorPlayed.push('C030_HalfTimberedHouse'); });
      let r = ok(s.getState());
      assert.equal(bonus(r, card) + bonus(r, 'C030_HalfTimberedHouse'), expected);
      if (c34 !== undefined)
          assert.equal(bonus(r, card), c34);
      if (rooms === 3)
          r = finishGame(s);
      assert.equal(bonus(r, card) + bonus(r, 'C030_HalfTimberedHouse'), expected);
      save(`D034-N3-${rooms}`, r);
  } });
})
