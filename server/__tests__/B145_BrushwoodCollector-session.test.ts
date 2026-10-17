import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit29Exchanges from './_helpers/audit/ae-negative-29-exchanges'

describe('ae-negative-29-exchanges', () => {
  const { sessions, save, ok, make, finish, expansion } = audit29Exchanges
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('B145 N1 one and two actual rooms replace each two reed with one extra wood', () => { const results = []; for (const n of [1, 2]) {
      const s = make('B145_BrushwoodCollector', true, 3, state => state.players[0]!.resources.wood = 6 * n), p = expansion(s);
      let r = ok(s.commitSelectionChoice(0, { rooms: Array.from({ length: n }, (_, col) => ({ row: 1, col: col + 1 })) }));
      r = finish(s, r);
      assert.deepEqual([r.state.players[0]!.rooms, r.state.players[0]!.resources.wood, r.state.players[0]!.resources.reed], [2 + n, 0, 0]);
      results.push({ p, r });
  } save('B145-N1', results); });
  it('B145 N2 normal room cost remains usable and renovation replaces one reed with one wood', () => { const s = make('B145_BrushwoodCollector', true, 3, state => Object.assign(state.players[0]!.resources, { wood: 5, reed: 2 })), p = expansion(s), room = finish(s, ok(s.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] }))); assert.deepEqual([room.state.players[0]!.rooms, room.state.players[0]!.resources.wood, room.state.players[0]!.resources.reed], [3, 0, 0]); const t = make('B145_BrushwoodCollector', true, 3, state => Object.assign(state.players[0]!.resources, { clay: 2, wood: 1 })); let renovation = ok(t.takeAction(0, 'house-redevelopment')); if (renovation.interaction.stateId === 'wait' && renovation.interaction.request.kind === 'choice' && renovation.interaction.request.options.some(o => o.value === 'clay'))
      renovation = ok(t.resolveChoice(0, 'clay')); renovation = finish(t, renovation); assert.deepEqual([renovation.state.players[0]!.houseType, renovation.state.players[0]!.resources.clay, renovation.state.players[0]!.resources.wood], ['clay', 0, 0]); save('B145-N2', { p, room, renovation }); });
  it('B145 N3 insufficient replacement wood and a held card cannot build unpaid rooms and occupied targets reject before legal retry', () => { const s = make('B145_BrushwoodCollector', true, 3, state => state.players[0]!.resources.wood = 5), bad = ok(s.takeAction(0, 'farm-expansion')); const t = make('B145_BrushwoodCollector', false, 3, state => state.players[0]!.resources.wood = 6), hand = ok(t.takeAction(0, 'farm-expansion')); assert.equal(bad.state.players[0]!.rooms, 2); assert.equal(hand.state.players[0]!.rooms, 2); save('B145-pending-debug', { bad, hand }); const poor = s.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] }), held = t.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] }); assert.equal(poor.ok, false); assert.equal(held.ok, false); assert.deepEqual([poor.state.players[0]!.rooms, poor.state.players[0]!.resources.wood, held.state.players[0]!.rooms, held.state.players[0]!.resources.wood], [2, 5, 2, 6]); const q = make('B145_BrushwoodCollector', true, 3, state => state.players[0]!.resources.wood = 6), p = expansion(q), occupied = assertRejectedUnchanged(q, () => q.commitSelectionChoice(0, { rooms: [{ row: 1, col: 0 }] })), r = finish(q, ok(q.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] }))); assert.equal(r.state.players[0]!.rooms, 3); save('B145-N3', { bad, hand, poor, held, p, occupied, r }); });
})
