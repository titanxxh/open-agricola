import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRuleOutcome, assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit35Education from './_helpers/audit/ae-negative-35-education'

describe('ae-negative-35-education', () => {
  const { sessions, save, ok, make, choose, pendingCard, trigger, finish, ready, action, buy, accept, OCC, educated, lesson } = audit35Education
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D042 N1 actual two improvement prerequisite purchase pays one food and gives no retroactive earlier occupation rewards', () => {
      const s = educated(3, false), r = finish(s, buy(s, 'D042_EducationBonus'));
      assert.equal(r.state.players[0]!.resources.food, 99);
      assert.deepEqual([r.state.players[0]!.resources.grain, r.state.players[0]!.resources.clay], [0, 0]);
      const rows = [];
      for (const [imps, food] of [[1, 100], [2, 0]] as const) {
          const t = educated(1, false, 0, imps, food), p = buy(t, 'D042_EducationBonus'), bad = assertRejectedUnchanged(t, () => t.resolveChoice(0, 'D042_EducationBonus'));
          assert.ok(p.state.players[0]!.minorHand.includes('D042_EducationBonus'));
          rows.push({ p, bad });
      }
      save('D042-N1', { r, rows });
  });
  it('D042 N2 actual first through fifth occupation public Lessons grants exactly grain clay reed stone vegetable by its actual ordinal', () => {
      const rows = [];
      for (const rank of [1, 2, 3, 4, 5] as const) {
          const s = educated(rank), r = lesson(s, OCC[rank - 1]!);
          assert.deepEqual((['grain', 'clay', 'reed', 'stone', 'vegetable'] as const).map(k => r.state.players[0]!.resources[k]), Array.from({ length: 5 }, (_, i) => i === rank - 1 ? 1 : 0));
          assert.equal(r.state.players[0]!.occupationPlayed.length, rank);
          rows.push(r);
      }
      save('D042-N2', rows);
  });
  it('D042 N3 the sixth occupation may plow after four or five existing connected fields and an occupied room rejects before a legal control', () => {
      const s = educated(6, true, 4), p = lesson(s, OCC[5]!, 'D042_EducationBonus'), a = accept(s, p, 'D042_EducationBonus');
      assert.ok(a.interaction.stateId === 'wait' && a.interaction.request.kind === 'farm-select');
      const bad = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 1, col: 0 } })), control = finish(s, ok(s.commitSelectionChoice(0, { tile: { row: 1, col: 4 } })));
      assert.equal(control.state.players[0]!.fields.length, 5);
      const t = educated(6, true, 5), q = lesson(t, OCC[5]!, 'D042_EducationBonus');
      let attempt = q;
      if (pendingCard(q, 'D042_EducationBonus'))
          attempt = accept(t, q, 'D042_EducationBonus');
      const target = t.commitSelectionChoice(0, { tile: { row: 1, col: 3 } });
      save('D042-N3', { p, a, bad, control, q, attempt, target });
      assertRuleOutcome({ fields: target.state.players[0]!.fields.length, occupations: target.state.players[0]!.occupationPlayed.length }, { fields: 6, occupations: 6 });
  });
  it('D042 N4 held cards actual opponent occupations seventh occupations and declining the sixth field give no unearned owner reward', () => {
      const hand = educated(1, false), held = lesson(hand, OCC[0]!);
      assert.equal(held.state.players[0]!.resources.grain, 0);
      const s = educated(7), seventh = lesson(s, OCC[6]!);
      assert.deepEqual((['grain', 'clay', 'reed', 'stone', 'vegetable'] as const).map(k => seventh.state.players[0]!.resources[k]), [0, 0, 0, 0, 0]);
      const t = educated(6, true, 4), p = trigger(t, lesson(t, OCC[5]!, 'D042_EducationBonus'), 'D042_EducationBonus'), decline = finish(t, choose(t, p, o => o.value === '__skip__'));
      assert.equal(decline.state.players[0]!.fields.length, 4);
      const u = make('D042_EducationBonus', true, state => { state.players[0]!.improvements = ['Major_Fireplace1', 'Major_Well']; state.players[1]!.occupationHand = ['A125_Priest']; }), first = action(u, 0, 'reed-bank');
      ready(u);
      let opponent = ok(u.takeAction(1, 'lessons'));
      if (opponent.interaction.stateId === 'wait' && opponent.interaction.request.kind === 'choice' && opponent.interaction.request.options.some(o => o.value === 'A125_Priest'))
          opponent = ok(u.resolveChoice(1, 'A125_Priest'));
      opponent = finish(u, opponent);
      assert.equal(opponent.state.players[0]!.resources.grain, 0);
      assert.equal(pendingCard(opponent, 'D042_EducationBonus'), false);
      save('D042-N4', { held, seventh, p, decline, first, opponent });
  });
})
