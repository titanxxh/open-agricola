import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRuleOutcome, assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit35Harvest from './_helpers/audit/ae-negative-35-harvest'

describe('ae-negative-35-harvest', () => {
  const { sessions, save, ok, choose, pendingCard, trigger, finish, action, progress, buy, accept, bonus, paint, paintChoice } = audit35Harvest
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E039 N1 actual pig and wood purchase then a real harvest exchanges exactly one clay for either two food or one bonus point and never both', () => {
      const s = paint(false), bought = finish(s, buy(s, 'E039_Paintbrush'));
      assert.equal(bought.state.players[0]!.resources.wood, 0);
      const rows = [];
      for (const reward of ['food', 'score'] as const) {
          const t = paint(), p = progress(t, 12, 'E039_Paintbrush'), chosen = paintChoice(t, p, reward), r = finish(t, chosen);
          assert.deepEqual([r.state.players[0]!.resources.clay, r.state.players[0]!.resources.food, bonus(r, 'E039_Paintbrush')], reward === 'food' ? [0, 98, 0] : [0, 96, 1]);
          rows.push({ p, chosen, r });
      }
      save('E039-N1', { bought, rows });
  });
  it('E039 N2 decline missing clay held card and a nonharvest boundary cannot exchange or earn a free point', () => {
      const s = paint(), p = trigger(s, progress(s, 12, 'E039_Paintbrush'), 'E039_Paintbrush'), decline = finish(s, choose(s, p, o => o.value === '__skip__'));
      assert.deepEqual([decline.state.players[0]!.resources.clay, decline.state.players[0]!.resources.food, bonus(decline, 'E039_Paintbrush')], [1, 96, 0]);
      const rows = [];
      for (const [played, clay] of [[true, 0], [false, 1]] as const) {
          const t = paint(played, clay), q = progress(t, 12, 'E039_Paintbrush'), r = finish(t, pendingCard(q, 'E039_Paintbrush') ? accept(t, q, 'E039_Paintbrush') : q);
          assert.equal(bonus(r, 'E039_Paintbrush'), 0);
          assert.equal(r.state.players[0]!.resources.food, 96);
          rows.push({ q, r });
      }
      const u = paint(true, 1, 100, 1, 1, 12), mid = action(u, 0, 'reed-bank'), next = progress(u, 13, 'E039_Paintbrush');
      assert.equal(mid.state.players[0]!.resources.food, 100);
      assert.equal(next.state.players[0]!.resources.clay, 1);
      assert.equal(next.state.players[0]!.resources.food, 100);
      assert.equal(pendingCard(next, 'E039_Paintbrush'), false);
      save('E039-N2', { p, decline, rows, mid, next });
  });
  it('E039 N3 actual food shortage is met by the two food branch once per harvest while missing pig and purchase wood are rejected', () => {
      const rows = [];
      for (const [pig, wood] of [[0, 1], [1, 0]] as const) {
          const s = paint(false, 1, 100, pig, wood), p = buy(s, 'E039_Paintbrush'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'E039_Paintbrush'));
          save('E039-N3-purchase-' + pig, p);
          if (pig > 0)
              assert.ok(p.state.players[0]!.minorHand.includes('E039_Paintbrush'));
          rows.push({ p, bad });
      }
      const t = paint(false, 1, 1, 1, 1, 11, 1), bought = finish(t, buy(t, 'E039_Paintbrush')), p = progress(t, 12, 'E039_Paintbrush'), chosen = paintChoice(t, p, 'food'), feed = finish(t, chosen, '__feed__');
      assert.ok(feed.interaction.stateId === 'wait' && feed.interaction.request.kind === 'feed');
      assert.deepEqual([feed.interaction.request.foodUsed, feed.interaction.request.remaining], [3, 1]);
      const recipe = feed.interaction.request.exchangeCatalog?.find(e => e.from.grain === 1 && e.to.food === 1);
      assert.ok(recipe);
      const r = finish(t, ok(t.resolveChoice(0, 'confirm', { selections: [{ sourceId: recipe.sourceId, exchangeIndex: recipe.exchangeIndex, count: 1, sourceName: recipe.sourceId }] })));
      assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.resources.clay, r.state.players[0]!.resources.grain, r.state.players[0]!.resources.begging], [0, 0, 0, 0]);
      const u = paint(true, 2), q = progress(u, 12, 'E039_Paintbrush'), once = finish(u, paintChoice(u, q, 'food'));
      assert.equal(once.state.players[0]!.resources.clay, 1);
      assert.equal(once.state.players[0]!.resources.food, 98);
      assert.equal(pendingCard(once, 'E039_Paintbrush'), false);
      save('E039-N3', { rows, bought, p, chosen, feed, r, q, once });
      const pigless = rows[0]!.p;
      assertRuleOutcome({ played: pigless.state.players[0]!.minorPlayed.includes('E039_Paintbrush'), wood: pigless.state.players[0]!.resources.wood }, { played: false, wood: 1 });
  });
})
