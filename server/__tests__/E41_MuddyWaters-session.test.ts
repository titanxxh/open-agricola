import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { E041_MuddyWaters } from '../../shared/cards/E/E041_MuddyWaters'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit35Future from './_helpers/audit/ae-negative-35-future'

describe('E041_MuddyWaters prerequisite', () => {
  it('blocks when player has fewer than 5 played cards', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['o1']
    player.minorPlayed = ['m1']
    player.improvements = ['i1']
    expect(session.withCtx(() => meetsCardPrerequisites(player, E041_MuddyWaters, state.round, state))).toBe(false)
  })

  it('allows when player has 5+ played cards', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed = ['o1', 'o2']
    player.minorPlayed = ['m1', 'm2']
    player.improvements = ['i1']
    expect(session.withCtx(() => meetsCardPrerequisites(player, E041_MuddyWaters, state.round, state))).toBe(true)
  })
})

describe('ae-negative-35-future', () => {
  const { sessions, save, finish, progress, buy, future, delayed } = audit35Future
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E041 N1 actual five played cards purchase queues only remaining even rounds and real six seven eight deliver food none clay', () => { const s = delayed('E041_MuddyWaters'), bought = finish(s, buy(s, 'E041_MuddyWaters')); assert.deepEqual(future(bought, 'E041_MuddyWaters'), [{ round: 6, kind: 'food', n: 1 }, { round: 8, kind: 'clay', n: 1 }, { round: 10, kind: 'food', n: 1 }, { round: 12, kind: 'clay', n: 1 }, { round: 14, kind: 'food', n: 1 }]); const six = progress(s, 6), seven = progress(s, 7), eight = progress(s, 8); assert.equal(six.state.players[0]!.resources.food, 101); assert.equal(seven.state.players[0]!.resources.food, 101); assert.deepEqual([eight.state.players[0]!.resources.food, eight.state.players[0]!.resources.clay], [97, 1]); assert.ok(bought.scores); assert.equal(bought.scores[0]!.categories.find(c => c.key === 'cards')!.entries.find(e => 'cardId' in e && e.cardId === 'E041_MuddyWaters')!.score, 1); save('E041-N1', { bought, six, seven, eight }); });
  it('E041 N2 four played cards cannot count the purchased card itself and a held card gives no future reward', () => { const s = delayed('E041_MuddyWaters', 5, false, false), p = buy(s, 'E041_MuddyWaters'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'E041_MuddyWaters')); assert.ok(p.state.players[0]!.minorHand.includes('E041_MuddyWaters')); assert.deepEqual(future(p, 'E041_MuddyWaters'), []); const t = delayed('E041_MuddyWaters'), hand = progress(t, 6); assert.equal(hand.state.players[0]!.resources.food, 100); save('E041-N2', { p, bad, hand }); });
  it('E041 N3 even and final round purchases begin with food on the next remaining even round and truncate at fourteen', () => {
      const rows = [];
      for (const [round, expected] of [[6, [{ round: 8, kind: 'food', n: 1 }, { round: 10, kind: 'clay', n: 1 }, { round: 12, kind: 'food', n: 1 }, { round: 14, kind: 'clay', n: 1 }]], [12, [{ round: 14, kind: 'food', n: 1 }]], [13, [{ round: 14, kind: 'food', n: 1 }]], [14, []]] as const) {
          const s = delayed('E041_MuddyWaters', round), r = finish(s, buy(s, 'E041_MuddyWaters'));
          assert.deepEqual(future(r, 'E041_MuddyWaters'), expected);
          rows.push(r);
      }
      save('E041-N3', rows);
  });
})
