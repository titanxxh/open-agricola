import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit38Resources from './_helpers/audit/ae-negative-38-resources'

describe('ae-negative-38-resources', () => {
  const { sessions, save, ok, make, choose, pendingCard, finish, ready, action, buy, paid, contraband } = audit38Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E054 N1 actual food purchase cannot trigger itself and a later wood cost minor can pay exactly one extra wood for three food', () => { const b = contraband(false), bought = finish(b, buy(b, 'E054_Contraband')); assert.equal(bought.state.players[0]!.resources.food, 99); const s = contraband(), p = finish(s, buy(s, 'C056_FeedFence'), 'E054_Contraband'); save('E054-N1-p', p); const r = finish(s, pendingCard(p, 'E054_Contraband') ? paid(s, p, 'E054_Contraband', 'wood') : p); save('E054-N1', { bought, p, r }); assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.food], [0, 103]); });
  it('E054 N2 actual clay and reed printed costs allow only one chosen extra resource after a minor and major purchase', () => {
      const rows = [];
      for (const target of ['C055_Studio', 'Major_Fireplace1'] as const) {
          const s = contraband(true, target);
          let p = target === 'Major_Fireplace1' ? ok(s.takeAction(0, 'major-improvement')) : buy(s, target);
          if (target === 'Major_Fireplace1' && p.interaction.stateId==='wait'&&p.interaction.request.kind==='choice'&&p.interaction.request.options.some(o=>o.value===target))
              p = ok(s.resolveChoice(0, target));
          p = finish(s, p, 'E054_Contraband');
          save('E054-N2-p-' + target, p);
          const bad = pendingCard(p, 'E054_Contraband') ? assertRejectedUnchanged(s, () => s.resolveChoice(0, 'not-a-payment')) : s.resolveChoice(0, 'not-a-payment');
          const r = finish(s, pendingCard(p, 'E054_Contraband') ? paid(s, p, 'E054_Contraband', 'clay') : p);
          save('E054-N2-r-' + target, r);assert.ok(target.startsWith('Major')?r.state.players[0]!.improvements.includes(target):r.state.players[0]!.minorPlayed.includes(target));
          assert.deepEqual([r.state.players[0]!.resources.clay, r.state.players[0]!.resources.reed, r.state.players[0]!.resources.food], target === 'C055_Studio' ? [1, 0, 103] : [0, 1, 103]);
          rows.push({ p, bad, r });
      }
      save('E054-N2', rows);
  });
  it('E054 N3 optional decline missing extra resource and a held card cannot give the three food reward', () => { const s = contraband(), p = finish(s, buy(s, 'C056_FeedFence'), 'E054_Contraband'), decline = finish(s, p); assert.deepEqual([decline.state.players[0]!.resources.wood, decline.state.players[0]!.resources.food], [1, 100]); const t = contraband(true, 'C056_FeedFence', false), empty = finish(t, buy(t, 'C056_FeedFence')); assert.deepEqual([empty.state.players[0]!.resources.wood, empty.state.players[0]!.resources.food], [0, 100]); const q = make('E054_Contraband', false, s => { s.players[0]!.minorHand = ['E054_Contraband', 'C056_FeedFence']; s.players[0]!.resources.wood = 2; }), hand = finish(q, buy(q, 'C056_FeedFence'), 'E054_Contraband'); assert.equal(pendingCard(hand, 'E054_Contraband'), false); assert.equal(hand.state.players[0]!.resources.food, 100); save('E054-N3', { p, decline, empty, hand }); });
  it('E054 N4 missing purchase food cannot buy and an actual opponent improvement cannot offer or reward the owner Contraband', () => { const s = make('E054_Contraband', false, state => { state.players[0]!.resources.food = 0; }), p = buy(s, 'E054_Contraband'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'E054_Contraband')); const t = make('E054_Contraband', true, state => { state.players[1]!.minorHand = ['C056_FeedFence']; state.players[1]!.resources.wood = 2; }), first = action(t, 0, 'reed-bank'); ready(t); let q = ok(t.takeAction(1, 'meeting-place')); if (q.interaction.stateId === 'wait' && q.interaction.request.kind === 'choice' && q.interaction.request.options.some(o => o.value.startsWith('action-improvement-')))
      q = choose(t, q, o => o.value.startsWith('action-improvement-')); if (!q.state.players[1]!.minorPlayed.includes('C056_FeedFence'))
      q = ok(t.resolveChoice(1, 'C056_FeedFence')); const r = finish(t, q, 'E054_Contraband'); assert.equal(pendingCard(r, 'E054_Contraband'), false); assert.deepEqual(r.state.players.map(p => p.resources.food), [100, 100]); save('E054-N4', { p, bad, first, q, r }); });
})
