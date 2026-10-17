import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit38Resources from './_helpers/audit/ae-negative-38-resources'

describe('ae-negative-38-resources', () => {
  const { sessions, save, ok, pendingCard, finish, action, buy, paid, wood } = audit38Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C058 N1 actual one occupation purchase and the five six wood thresholds grant exactly one or zero food after collection', () => {
      const b = wood(false), bought = finish(b, buy(b, 'C058_Woodcraft'));
      assert.ok(bought.state.players[0]!.minorPlayed.includes('C058_Woodcraft'));
      const rows = [];
      for (const [n, food] of [[2, 101], [3, 100]] as const) {
          const s = wood(true, n), r = action(s, 0, 'forest');
          assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.food], [n + 3, food]);
          rows.push(r);
      }
      save('C058-N1', { bought, rows });
  });
  it('C058 N2 immediately after threshold is checked before a later Tree Guard return to the original accumulation space', () => {
      const rows = [];
      for (const [n, food] of [[2, 101], [3, 100]] as const) {
          const s = wood(true, n, 1, true), p = finish(s, ok(s.takeAction(0, 'forest')), 'C102_TreeGuard'), r = finish(s, paid(s, p, 'C102_TreeGuard', 'wood'));
          assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.food], [n - 1, food]);
          assert.equal(r.state.actionSpaces.find(a => a.id === 'forest')!.resources.wood, 4);
          rows.push({ p, r });
      }
      save('C058-N2', rows);
  });
  it('C058 N3 held card nonwood and opponent accumulation cannot give owner food and zero occupations cannot purchase', () => { const s = wood(false), hand = action(s, 0, 'forest'); assert.equal(pendingCard(hand, 'C058_Woodcraft'), false); assert.equal(hand.state.players[0]!.resources.food, 100); const t = wood(), other = action(t, 0, 'clay-pit'), opponent = action(t, 1, 'forest'); assert.equal(other.state.players[0]!.resources.food, 100); assert.equal(opponent.state.players[0]!.resources.food, 100); const q = wood(false, 2, 0), p = buy(q, 'C058_Woodcraft'), bad = assertRejectedUnchanged(q, () => q.resolveChoice(0, 'C058_Woodcraft')); save('C058-N3', { hand, other, opponent, p, bad }); });
})
