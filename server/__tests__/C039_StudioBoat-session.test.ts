import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRuleOutcome, assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit35Placement from './_helpers/audit/ae-negative-35-placement'

describe('ae-negative-35-placement', () => {
  const { sessions, save, finish, ready, action, buy, bonus, studio, boat } = audit35Placement
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C039 N1 actual two player purchase creates an all access food accumulation space whose own use scores one and opponent use scores no owner point', () => { const s = studio(), own = boat(s), r = action(s, 0, 'C039_StudioBoat'); assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.food], [0, 101]); const t = studio(), other = boat(t), first = action(t, 0, 'reed-bank'), opponent = action(t, 1, 'C039_StudioBoat'); assert.equal(opponent.state.players[1]!.resources.food, 101); assert.equal(bonus(opponent, 'C039_StudioBoat'), 0); save('C039-N1', { own, r, other, first, opponent }); assertRuleOutcome({ bonus: bonus(r, 'C039_StudioBoat'), counter: r.state.players[0]!.cardStates.C039_StudioBoat?.counters?.bonusVp }, { bonus: 1, counter: 1 }); });
  it('C039 N2 actual four player purchase has no card space and only owner Traveling Players use gives its point while Fishing and opponent use do not', () => { const s = studio(4), bought = finish(s, buy(s, 'C039_StudioBoat')); assert.equal(bought.state.actionSpaces.some(a => a.id === 'C039_StudioBoat'), false); ready(s); const wrong = assertRejectedUnchanged(s, () => s.takeAction(1, 'C039_StudioBoat')); action(s, 1, 'fishing'); action(s, 2, 'forest'); action(s, 3, 'reed-bank'); const own = action(s, 0, 'traveling-players'); assert.equal(own.state.players[0]!.cardStates.C039_StudioBoat?.counters?.bonusVp, 1); const t = studio(4), otherBuy = finish(t, buy(t, 'C039_StudioBoat')), opponent = action(t, 1, 'traveling-players'); assert.equal(bonus(opponent, 'C039_StudioBoat'), 0); const u = studio(), a = boat(u), fishing = action(u, 0, 'fishing'); assert.equal(bonus(fishing, 'C039_StudioBoat'), 0); save('C039-N2', { bought, wrong, own, otherBuy, opponent, a, fishing }); assertRuleOutcome({ bonus: bonus(own, 'C039_StudioBoat'), counter: own.state.players[0]!.cardStates.C039_StudioBoat?.counters?.bonusVp }, { bonus: 1, counter: 1 }); });
  it('C039 N3 missing occupation or wood held card and actual occupied private space cannot bypass creation and placement admission', () => {
      const rows = [];
      for (const [wood, occ] of [[1, 0], [0, 1]] as const) {
          const s = studio(2, wood, occ), p = buy(s, 'C039_StudioBoat'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'C039_StudioBoat'));
          assert.ok(p.state.players[0]!.minorHand.includes('C039_StudioBoat'));
          rows.push({ p, bad });
      }
      const t = studio(), held = assertRejectedUnchanged(t, () => t.takeAction(0, 'C039_StudioBoat')), u = studio(), created = boat(u), used = action(u, 0, 'C039_StudioBoat');
      ready(u);
      const occupied = assertRejectedUnchanged(u, () => u.takeAction(1, 'C039_StudioBoat')), retry = action(u, 1, 'reed-bank');
      assert.equal(bonus(retry, 'C039_StudioBoat') - bonus(used, 'C039_StudioBoat'), 0);
      save('C039-N3', { rows, held, created, used, occupied, retry });
  });
})
