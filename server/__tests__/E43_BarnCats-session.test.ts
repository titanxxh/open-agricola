import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { E043_BarnCats } from '../../shared/cards/E/E043_BarnCats'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import * as audit36Native from './_helpers/audit/ae-negative-36-native'

describe('E043_BarnCats prerequisite', () => {
  it('blocks when player owns no stable', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.stableTiles = []
    expect(session.withCtx(() => meetsCardPrerequisites(player, E043_BarnCats, state.round, state))).toBe(false)
  })

  it('allows when player has at least 1 stable', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.stableTiles = [{ row: 0, col: 4 }]
    expect(session.withCtx(() => meetsCardPrerequisites(player, E043_BarnCats, state.round, state))).toBe(true)
  })

  it('allows when the only stable is the B85 FarmHand stable (card-facing count)', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.stableTiles = []
    player.occupationPlayed.push('B085_FarmHand')
    player.cardStates = {
      B085_FarmHand: { extraData: { position: { row: 0, col: 0 } } },
    }
    expect(session.withCtx(() => meetsCardPrerequisites(player, E043_BarnCats, state.round, state))).toBe(true)
  })
})

describe('ae-negative-36-native', () => {
  const { sessions, traces, save, make, end, final, purchase, rejectBuy, undo, resource, future, points, stables } = audit36Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("E043 N1 real free purchases with one through four finite stables give the literal schedules and first food", () => { for (const n of [1, 2, 3, 4]) {
      const s = make('E043_BarnCats', st => stables(st.players[0]!, n), false), r = purchase(s, 'E043_BarnCats');
      assert.deepEqual(future(r, 'E043_BarnCats'), [6, 7, 8, 9, 10].slice(0, n + 1));
      assert.equal(r.state.players[0]!.stableTiles.length, n);
      const due = end(s);
      resource(due, { food: 101 });
      save(`E043-N1-${n}`, { r, due });
  } });
  it("E043 N2 reserve stables alone do not meet the prerequisite and a held card never schedules food", () => { save('E043-N2-prerequisite', rejectBuy(make('E043_BarnCats', undefined, false), 'E043_BarnCats')); const s = make('E043_BarnCats', st => stables(st.players[0]!, 1), false), r = end(s, true, [], 'E043_BarnCats'); resource(r, { food: 100 }); assert.deepEqual(future(r, 'E043_BarnCats'), []); save('E043-N2-hand', r); });
  it("E043 N3 late purchases truncate and actual undo removes queued food before replay and scoring", () => { for (const round of [13, 14]) {
      const s = make('E043_BarnCats', st => stables(st.players[0]!, 4), false, round), r = purchase(s, 'E043_BarnCats'), u = undo(s);
      assert.ok(u.state.players[0]!.minorHand.includes('E043_BarnCats'));
      assert.deepEqual(future(u, 'E043_BarnCats'), []);
      assert.deepEqual(u.state.players[0]!.stableTiles, r.state.players[0]!.stableTiles);
      purchase(s, 'E043_BarnCats');
      assert.deepEqual(future(r, 'E043_BarnCats'), round === 13 ? [14] : []);
      const due = round === 13 ? end(s) : final(s);
      if (round === 13)
          resource(due, { food: 97 });
      else
          assert.equal(points(due, 'E043_BarnCats'), 1);
      save(`E043-N3-${round}`, { r, u, due });
  } });
})
