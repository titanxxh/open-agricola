import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { familySize } from '../../shared/domain/player'
import * as audit34Scoring from './_helpers/audit/ae-negative-34-scoring'

describe('ae-negative-34-scoring', () => {
  const { sessions, ok, save, setup, finish, take, prerequisites, hand, buy, bonus, printed, house, denyMinor, setPeople } = audit34Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E035 N1 real printed purchase pays exact cost and excludes insufficient resources or prerequisite', () => { const card = 'E035_Misanthropy', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { food: 40, wood: 1 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); assert.equal(r.state.players[0]!.resources.wood, 0); save('E035-N1-legal', r); {
      const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); st.players[0]!.houseType = 'wood'; Object.assign(st.players[0]!.resources, { food: 40, wood: 0 }); });
      const q = denyMinor(t, card);
      assert.equal(printed(q, card), 0);
      save('E035-N1-resource', q);
  } });
  it('E035 N2 exact two three four and five original people score five three two and zero', () => { for (const [n, expected] of [[2, 5], [3, 3], [4, 2], [5, 0]] as const) {
      const card = 'E035_Misanthropy', s = setup(card, 14, st => { house(st, n); setPeople(st, n); });
      const r = ok(s.getState());
      assert.equal(familySize(r.state.players[0]!), n);
      assert.equal(bonus(r, card), expected);
      assert.equal(r.state.players[0]!.workers.length, 5);
      save(`E035-N2-${n}`, r);
  } });
  it('E035 N3 real room limited growth changes person score while hand-only and opponent growth do not', () => { for (const mode of ['owner', 'opponent', 'hand']) {
      const card = 'E035_Misanthropy', s = setup(card, 14, st => { house(st, 3); if (mode === 'hand')
          hand(st, card); if (mode === 'opponent') {
          st.currentPlayerIndex = 1;
          st.players[1]!.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }];
          st.players[1]!.rooms = 3;
      } });
      let r = take(s, 'wish-children');
      r = finish(s, r, true);
      assert.equal(familySize(r.state.players[mode === 'opponent' ? 1 : 0]!), 3);
      assert.equal(bonus(r, card), mode === 'owner' ? 3 : mode === 'opponent' ? 5 : 0);
      save(`E035-N3-${mode}`, r);
  } });
})
