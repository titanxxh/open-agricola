import { describe, expect, it, afterEach } from 'vitest'
import { playMinor, setupMinorSession } from './_helpers/batch07-card-play'

import '../../shared/cards/D/D033_SummerHouse'
import assert from 'node:assert/strict'
import * as audit34Scoring from './_helpers/audit/ae-negative-34-scoring'

describe('D033 Summer House through Session', () => {
  it.each(['clay', 'stone'] as const)('rejects play in a %s house', (houseType) => {
    const response = playMinor(setupMinorSession({
      cardId: 'D033_SummerHouse', resources: { wood: 3, stone: 1 }, houseType,
    }), 'D033_SummerHouse')
    expect(response.state.players[0]!.minorPlayed).not.toContain('D033_SummerHouse')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, stone: 1 })
  })

  it('allows play while the player still lives in wood', () => {
    const response = playMinor(setupMinorSession({
      cardId: 'D033_SummerHouse', resources: { wood: 3, stone: 1 }, houseType: 'wood',
    }), 'D033_SummerHouse')
    expect(response.state.players[0]!.minorPlayed).toContain('D033_SummerHouse')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })
  })
})

describe('ae-negative-34-scoring', () => {
  const { sessions, ok, save, setup, prerequisites, hand, buy, pasture, bonus, printed, finishGame, house, denyMinor } = audit34Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D033 N1 real printed purchase pays exact cost and excludes insufficient resources or prerequisite', () => { const card = 'D033_SummerHouse', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { food: 40, wood: 3, stone: 1 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.stone, 0); save('D033-N1-legal', r); {
      const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); st.players[0]!.houseType = 'wood'; Object.assign(st.players[0]!.resources, { food: 40, wood: 2, stone: 1 }); });
      const q = denyMinor(t, card);
      assert.equal(printed(q, card), 0);
      save('D033-N1-resource', q);
  } {
      const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); st.players[0]!.houseType = 'clay'; Object.assign(st.players[0]!.resources, { food: 40, wood: 3, stone: 1 }); });
      const q = denyMinor(t, card);
      assert.equal(printed(q, card), 0);
      save('D033-N1-clayhouse', q);
  } {
      const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); st.players[0]!.houseType = 'stone'; Object.assign(st.players[0]!.resources, { food: 40, wood: 3, stone: 1 }); });
      const q = denyMinor(t, card);
      assert.equal(printed(q, card), 0);
      save('D033-N1-stonehouse', q);
  } });
  it('D033 N2 stone house scores distinct unused orthogonal neighbors and keeps ordinary unused penalties', () => { for (const [n, expected] of [[2, 6], [3, 8]] as const) {
      const card = 'D033_SummerHouse', s = setup(card, 14, st => { house(st, n, 'stone'); if (n === 3) {
          st.players[0]!.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }];
      } });
      const r = ok(s.getState());
      assert.equal(bonus(r, card), expected);
      assert.ok(r.scores);
      const unused = r.scores[0]!.categories.find(c => c.key === 'empty');
      save(`D033-N2-${n}`, r);
      assert.equal(unused?.total, -(15 - n));
  } for (const type of ['wood', 'clay'] as const) {
      const s = setup('D033_SummerHouse', 14, st => house(st, 2, type));
      const r = ok(s.getState());
      assert.equal(bonus(r, 'D033_SummerHouse'), 0);
      save(`D033-N2-${type}`, r);
  } });
  it('D033 N3 occupied neighboring farm tiles and diagonal empty tiles do not give extra points', () => { const card = 'D033_SummerHouse', s = setup(card, 14, st => { house(st, 2, 'stone'); st.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]; st.players[0]!.stableTiles = [{ row: 1, col: 1 }]; pasture(st, [{ row: 2, col: 1 }]); }); let r = ok(s.getState()); assert.equal(bonus(r, card), 0); r = finishGame(s); assert.equal(bonus(r, card), 0); save('D033-N3-occupied', r); const t = setup(card, 14, st => { hand(st, card); house(st, 3, 'stone'); }); const q = ok(t.getState()); assert.equal(bonus(q, card), 0); save('D033-N3-hand', q); });
})
