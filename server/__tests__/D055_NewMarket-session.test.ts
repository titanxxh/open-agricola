import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit38Timing from './_helpers/audit/ae-negative-38-timing'

describe('ae-negative-38-timing', () => {
  const { sessions, save, make, pendingCard, finish, buy, action, printed, ORDER, market } = audit38Timing
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D055 N1 actual two resource purchase and all four action cards physically in legal round spaces eight through eleven grant exactly one additional food at round fourteen', () => {
      const b = market(false), bought = finish(b, buy(b, 'D055_NewMarket'));
      assert.deepEqual([bought.state.players[0]!.resources.wood, bought.state.players[0]!.resources.clay, printed(bought, 'D055_NewMarket')], [0, 0, 1]);
      const rows = [];
      for (const space of ['pig-market', 'vegetable-seeds', 'cattle-market', 'eastern-quarry'] as const) {
          const s = market(), r = action(s, 0, space);
          assert.equal(r.state.players[0]!.resources.food, 101);
          if (space === 'pig-market' || space === 'cattle-market')
              assert.equal(r.state.players[0]!.pastures[0]!.animalCount, 1);
          rows.push(r);
      }
      save('D055-N1', { bought, rows, order: ORDER });
  });
  it('D055 N2 outside round spaces seven twelve and basic accumulation exclude the reward and the current round is not the card location', () => {
      const rows = [];
      for (const space of ['western-quarry', 'urgent-wish-children', 'reed-bank'] as const) {
          const s = market(), r = action(s, 0, space);
          assert.equal(r.state.players[0]!.resources.food, 100);
          rows.push(r);
      }
      save('D055-N2', rows);
  });
  it('D055 N3 held card and actual opponent eligible action cannot reward the owner and missing either printed resource rejects purchase', () => {
      const s = market(false), hand = action(s, 0, 'vegetable-seeds');
      assert.equal(pendingCard(hand, 'D055_NewMarket'), false);
      assert.equal(hand.state.players[0]!.resources.food, 100);
      const t = market(), first = action(t, 0, 'reed-bank'), opponent = action(t, 1, 'vegetable-seeds');
      assert.equal(opponent.state.players[0]!.resources.food, 100);
      const rows = [];
      for (const missing of ['wood', 'clay'] as const) {
          const q = make('D055_NewMarket', false, s => Object.assign(s.players[0]!.resources, { wood: missing === 'wood' ? 0 : 1, clay: missing === 'clay' ? 0 : 1 })), p = buy(q, 'D055_NewMarket'), bad = assertRejectedUnchanged(q, () => q.resolveChoice(0, 'D055_NewMarket'));
          rows.push({ p, bad });
      }
      save('D055-N3', { hand, first, opponent, rows });
  });
})
