import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import type { SessionResponse } from '../game/authoritative-session'
import { assertRejectedUnchanged, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit07Spaces from './_helpers/audit/ae-negative-07-spaces'

describe('ae-negative-07-spaces', () => {
  const { A040, tile, pair, edges, sessions, ok, opts, ready, turn, buy, denied, purchasedCardUndo, remaining, potter, boughtPotter, farm, finish, exchange, plow } = audit07Spaces
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A040 N1 eight unused spaces or fee shortage reject before seven-space onBuy control', () => {
    denied(potter({ fields: 5 }), A040); denied(potter({ resources: { wood: 0, reed: 1 } }), A040); denied(potter({ resources: { wood: 1, reed: 0 } }), A040)
    const r = buy(potter(), A040); assert.equal(remaining(r), 7); assert.equal(r.state.players[0]!.resources.clay, 0); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.reed, 0)
  })
  it('A040 N2 new field collects one clay after invalid room target and may decline exchange', () => {
    const s = boughtPotter(potter()); turn(s, 0, 'farmland'); assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 1, col: 0 } })); const r = finish(s, plow(s)); assert.equal(r.state.players[0]!.fields.length, 7); assert.equal(r.state.players[0]!.resources.clay, 1); assert.equal(r.state.players[0]!.resources.food, 40); assert.equal(remaining(r), 6)
  })
  it('A040 N3 new stable exchanges exactly one collected clay for two food once', () => {
    const s = boughtPotter(potter({ resources: { wood: 3, reed: 1 } })); farm(s, 'stables'); const pending = ok(s.commitSelectionChoice(0, { stables: [tile] })); const old = opts(pending).find(o => o.value !== '__skip__'); assert.ok(old); const r = exchange(s, pending); assert.equal(r.state.players[0]!.stableTiles.length, 1); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.clay, 0); assert.equal(r.state.players[0]!.resources.food, 42); assert.equal(remaining(r), 6); assertRejectedUnchanged(s, () => s.resolveChoice(0, old.value))
  })
  it('A040 N4 two new rooms collect two clay and permit a one-clay partial exchange', () => {
    const s = boughtPotter(potter({ resources: { wood: 11, reed: 5 } })); farm(s, 'construct'); const r = exchange(s, ok(s.commitSelectionChoice(0, { rooms: pair })), true); assert.equal(r.state.players[0]!.rooms, 4); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.reed, 0); assert.equal(r.state.players[0]!.resources.clay, 1); assert.equal(r.state.players[0]!.resources.food, 42); assert.equal(remaining(r), 5)
  })
  it('A040 N5 new pasture collects clay while opponent plow does not consume holder supply', () => {
    const s = boughtPotter(potter({ resources: { wood: 5, reed: 1 } }), true); assert.equal(remaining(s.getState()), 7); assert.equal(s.getState().state.players[1]!.resources.clay, 0); turn(s, 0, 'fencing'); const r = finish(s, ok(s.commitSelectionChoice(0, { edges }))); assert.equal(r.state.players[0]!.pastures.flatMap(p => p.tiles).length, 1); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.clay, 1); assert.equal(r.state.players[0]!.resources.food, 40); assert.equal(remaining(r), 6)
  })
  it('A040 N6 stable in pasture and fencing an existing stable collect no second clay', () => {
    for (const used of ['pasture', 'stable'] satisfies ('pasture' | 'stable')[]) {
      const s = boughtPotter(potter({ fields: 5, used, resources: { wood: used === 'pasture' ? 3 : 5, reed: 1 } })); let r: SessionResponse
      if (used === 'pasture') { farm(s, 'stables'); r = finish(s, ok(s.commitSelectionChoice(0, { stables: [tile] }))) } else { turn(s, 0, 'fencing'); r = finish(s, ok(s.commitSelectionChoice(0, { edges }))) }
      assert.equal(r.state.players[0]!.resources.clay, 0); assert.equal(r.state.players[0]!.resources.food, 40); assert.equal(remaining(r), 7)
    }
  })
  it('A040 N7 undo restores newly used tile and clay before replay without exchange', () => {
    const s = boughtPotter(potter()); ready(s, 0); const before = undoRuleSnapshot(s.getState()); turn(s, 0, 'farmland'); exchange(s, plow(s)); purchasedCardUndo(before, s.undoAction()); turn(s, 0, 'farmland'); const r = finish(s, plow(s)); assert.equal(r.state.players[0]!.fields.length, 7); assert.equal(r.state.players[0]!.resources.clay, 1); assert.equal(r.state.players[0]!.resources.food, 40); assert.equal(remaining(r), 6)
  })
})
