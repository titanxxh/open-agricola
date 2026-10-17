import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit35Resources from './_helpers/audit/ae-negative-35-resources'

describe('ae-negative-35-resources', () => {
  const { sessions, save, ok, make, finish, ready, action, buy, bonus, animal, skull } = audit35Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E037 N1 an actual housed cattle allows free purchase without consuming it and retained cattle exclude its scoring bonus', () => { const s = skull(), r = finish(s, buy(s, 'E037_OxSkull')); assert.ok(r.state.players[0]!.minorPlayed.includes('E037_OxSkull')); assert.equal(r.state.players[0]!.resources.cattle, 1); assert.equal(bonus(r, 'E037_OxSkull'), 0); save('E037-N1', r); });
  it('E037 N2 actual purchase followed by public cattle cooking removes the last cattle and scores exactly three bonus points', () => { const s = skull(), bought = finish(s, buy(s, 'E037_OxSkull')), opponent = action(s, 1, 'forest'), turn = ready(s), p = ok(s.takeAnytimeAction(0, 'exchange')); assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'choice'); const recipe = p.interaction.request.options.find(o => o.effectPreview !== undefined && 'resourcesPaid' in o.effectPreview && o.effectPreview.resourcesPaid?.cattle === 1); assert.ok(recipe, JSON.stringify(p.interaction)); const cooked = ok(s.resolveChoice(0, `bulk:${recipe.value.split(':')[1]}=1`)), r = finish(s, cooked); assert.equal(r.state.players[0]!.resources.cattle, 0); assert.equal(bonus(r, 'E037_OxSkull'), 3); assert.equal(Object.values(r.state.players[0]!.houseAnimals).length, 0); save('E037-N2', { bought, opponent, turn, p, cooked, r }); });
  it('E037 N3 no cattle cannot purchase and a held card with no cattle cannot score even when the opponent has cattle', () => { const s = skull(0), p = buy(s, 'E037_OxSkull'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'E037_OxSkull')); assert.ok(p.state.players[0]!.minorHand.includes('E037_OxSkull')); assert.equal(bonus(p, 'E037_OxSkull'), 0); const t = make('E037_OxSkull', false, state => animal(state, 'cattle', 1, 1)), hand = action(t, 0, 'reed-bank'); assert.equal(bonus(hand, 'E037_OxSkull'), 0); save('E037-N3', { p, bad, hand }); });
})
