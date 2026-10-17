import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit29Timing from './_helpers/audit/ae-negative-29-timing'

describe('ae-negative-29-timing', () => {
  const { sessions, save, SAFE, progress, scientist } = audit29Timing
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('B139 N1 real removal of all board wood rewards one food before round five and two food from round five during returning home', () => { const rows = []; for (const [round, gain] of [[3, 1], [5, 2]]) {
      const s = scientist(round!), r = progress(s, round! + 1);
      assert.equal(r.state.players[0]!.resources.food, 100 + gain!);
      assert.equal(r.state.round, round! + 1);
      rows.push(r);
  } save('B139-N1', rows); });
  it('B139 N2 one untouched wood accumulation and a held scientist exclude the returning home reward', () => { const s = scientist(5), r = progress(s, 6, '', SAFE.filter(id => id !== 'grove')); assert.equal(r.state.players[0]!.resources.food, 100); const t = scientist(5, false), hand = progress(t, 6); assert.equal(hand.state.players[0]!.resources.food, 100); save('B139-N2', { r, hand }); });
})
