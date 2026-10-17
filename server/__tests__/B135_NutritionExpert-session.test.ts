import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit29Timing from './_helpers/audit/ae-negative-29-timing'

describe('ae-negative-29-timing', () => {
  const { sessions, save, make, choose, pendingCard, trigger, finish, lesson, progress, bonus, nutrition, accept } = audit29Timing
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('B135 N1 each housed animal type pays exactly one grain vegetable and animal at a natural round start for five food and two points', () => { const results = []; for (const animal of ['sheep', 'boar', 'cattle'] as const) {
      const s = nutrition(true, animal), p = progress(s, 6, 'B135_NutritionExpert'), r = finish(s, accept(s, p, 'B135_NutritionExpert'));
      assert.deepEqual([r.state.players[0]!.resources[animal], r.state.players[0]!.resources.grain, r.state.players[0]!.resources.vegetable, r.state.players[0]!.resources.food, bonus(r, 'B135_NutritionExpert')], [0, 0, 0, 105, 2]);
      results.push({ p, r });
  } save('B135-N1', results); });
  it('B135 N2 decline missing grain missing vegetable and a held card never grant unpaid food or VP', () => { const s = nutrition(), p = trigger(s, progress(s, 6, 'B135_NutritionExpert'), 'B135_NutritionExpert'), decline = finish(s, choose(s, p, o => o.value === '__skip__')); assert.deepEqual([decline.state.players[0]!.resources.sheep, decline.state.players[0]!.resources.grain, decline.state.players[0]!.resources.vegetable, decline.state.players[0]!.resources.food, bonus(decline, 'B135_NutritionExpert')], [1, 1, 1, 100, 0]); const results = []; for (const [played, grain, veg] of [[true, 0, 1], [true, 1, 0], [false, 1, 1]] as const) {
      const t = nutrition(played, 'sheep', grain, veg), r = progress(t, 6);
      assert.equal(pendingCard(r, 'B135_NutritionExpert'), false);
      assert.equal(r.state.players[0]!.resources.food, 100);
      assert.equal(bonus(r, 'B135_NutritionExpert'), 0);
      results.push(r);
  } save('B135-N2', { p, decline, results }); });
  it('B135 N3 actual occupation and work phase do not exchange early and missing animal or a held card cannot gain from an accepted round start offer', () => { const s = make('B135_NutritionExpert', false, state => Object.assign(state.players[0]!.resources, { grain: 1, vegetable: 1 })), bought = lesson(s, 'B135_NutritionExpert'); assert.deepEqual([bought.state.players[0]!.resources.food, bought.state.players[0]!.resources.grain, bought.state.players[0]!.resources.vegetable, bonus(bought, 'B135_NutritionExpert')], [100, 1, 1, 0]); const missing = progress(s, 6, 'B135_NutritionExpert'); assert.equal(pendingCard(missing, 'B135_NutritionExpert'), false); const t = nutrition(false), hand = progress(t, 6, 'B135_NutritionExpert'); assert.equal(pendingCard(hand, 'B135_NutritionExpert'), false); assert.equal(hand.state.players[0]!.resources.food, 100); save('B135-N3', { bought, missing, hand }); });
})
