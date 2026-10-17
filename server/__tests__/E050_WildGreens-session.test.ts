import { describe, expect, it, afterEach } from 'vitest'
import { setupSowingSession, sowCrops } from './_helpers/batch07-sowing'

import '../../shared/cards/E/E050_WildGreens'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit37Food from './_helpers/audit/ae-negative-37-food'

describe('E050 Wild Greens through Session', () => {
  it('rewards each different crop type once, including repeated grain sowing', () => {
    const mixed = setupSowingSession({ cardId: 'E050_WildGreens', grain: 1, vegetable: 1 })
    mixed.state.players[0]!.fields = [
      { row: 0, col: 2, stacks: [] },
      { row: 1, col: 2, stacks: [] },
    ]
    mixed.loadState(mixed.state)
    const mixedResponse = sowCrops(mixed, [
      { row: 0, col: 2, crop: 'grain' },
      { row: 1, col: 2, crop: 'vegetable' },
    ])
    expect(mixedResponse.state.players[0]!.resources.food).toBe(2)

    const repeated = setupSowingSession({ cardId: 'E050_WildGreens', grain: 2 })
    repeated.state.players[0]!.fields = [
      { row: 0, col: 2, stacks: [] },
      { row: 1, col: 2, stacks: [] },
    ]
    repeated.loadState(repeated.state)
    const repeatedResponse = sowCrops(repeated, [
      { row: 0, col: 2, crop: 'grain' },
      { row: 1, col: 2, crop: 'grain' },
    ])
    expect(repeatedResponse.state.players[0]!.resources.food).toBe(1)
  })
})

describe('ae-negative-37-food', () => {
  const { sessions, save, setup, finish, take, prerequisites, hand, buy, printed, fields, sowCrops } = audit37Food
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E050 N1 actual printed purchase pays exact cost and excludes unavailable resources', () => { const card = 'E050_WildGreens', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, {}); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); save('E050-N1-legal', r); });
  it('E050 N2 actual sowing counts distinct crop types once and not the number of fields', () => {
      for (const crops of [['grain', 'grain'], ['grain', 'vegetable']] as const) {
          const card = 'E050_WildGreens', s = setup(card, 14, st => { fields(st, 2); Object.assign(st.players[0]!.resources, { grain: 2, vegetable: 1 }); });
          const r = finish(s, sowCrops(s, [...crops]), true);
          assert.equal(r.state.players[0]!.resources.food, crops[1] === 'grain' ? 41 : 42);
          assert.deepEqual(r.state.players[0]!.fields.map(f => f.stacks[0]?.remaining), crops[1] === 'grain' ? [3, 3] : [3, 2]);
          save(`E050-N2-${crops[1]}`, r);
      }
  });
  it('E050 N3 zero resources hand only and unrelated sow controls cannot reward food', () => {
      for (const mode of ['empty', 'hand', 'unrelated']) {
          const card = 'E050_WildGreens', s = setup(card, 14, st => {
              fields(st, 2);
              st.players[0]!.resources.grain = mode === 'empty' ? 0 : 2;
              if (mode === 'hand')
                  hand(st, card);
          });
          let r = s.getState();
          if (mode === 'empty') {
              assertRejectedUnchanged(s, () => s.takeAction(0, 'grain-utilization'));
          }
          else
              r = finish(s, mode === 'hand' ? sowCrops(s, ['grain', 'grain']) : take(s, 'forest'), mode === 'hand');
          assert.equal(r.state.players[0]!.resources.food, 40);
          save(`E050-N3-${mode}`, r);
      }
  });
})
