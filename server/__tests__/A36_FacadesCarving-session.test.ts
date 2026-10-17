import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A036_FacadesCarving } from '../../shared/cards/A/A036_FacadesCarving'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit07Scoring from './_helpers/audit/ae-negative-07-scoring'

describe('A036_FacadesCarving prerequisite', () => {
  it('blocks when wood in supply < current round', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.round = 5
    const player = state.players[0]!
    player.resources.wood = 4
    expect(session.withCtx(() => meetsCardPrerequisites(player, A036_FacadesCarving, state.round, state))).toBe(false)
  })

  it('allows when wood in supply >= current round', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.round = 5
    const player = state.players[0]!
    player.resources.wood = 5
    expect(session.withCtx(() => meetsCardPrerequisites(player, A036_FacadesCarving, state.round, state))).toBe(true)
  })
})

describe('ae-negative-07-scoring', () => {
  const { FACADES, sessions, ok, options, buy, denied, bonus, accept, decline, facades } = audit07Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A036 N1 round wood shortfall rejects forged purchase and exact prerequisite wood is retained', () => {
    denied(facades({ wood: 7 }), FACADES)
    const s = facades(); const r = buy(s, FACADES); assert.equal(r.state.players[0]!.resources.wood, 8); assert.equal(r.state.players[0]!.resources.clay, 0); assert.equal(bonus(r, FACADES), 0); assertRejectedUnchanged(s, () => s.resolveChoice(0, FACADES))
  })
  it('A036 N2 completed harvest boundaries cap literal food payments and bonus points', () => {
    for (const [round, cap] of [[4, 0], [5, 1], [7, 1], [8, 2], [9, 2], [10, 3], [11, 3], [12, 4], [13, 4], [14, 5]]) {
      const s = facades({ wood: round, round }); let r = buy(s, FACADES)
      if (cap) { const menu = options(r).filter(o => o.value !== '__skip__'); assert.equal(menu.length, cap); r = accept(s, r, cap) }
      assert.equal(r.state.players[0]!.resources.food, 5 - cap); assert.equal(r.state.players[0]!.resources.wood, round); assert.equal(r.state.players[0]!.resources.clay, 0); assert.equal(bonus(r, FACADES), cap)
    }
  })
  it('A036 N3 insufficient food excludes unaffordable exchanges and exact one food pays one point', () => {
    const s = facades({ food: 1 }); const r = buy(s, FACADES); assert.equal(options(r).filter(o => !o.disabled && o.value !== '__skip__').length, 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'exchange-nine-food')); const after = accept(s, r); assert.equal(after.state.players[0]!.resources.food, 0); assert.equal(bonus(after, FACADES), 1)
  })
  it('A036 N4 zero food and no completed harvest cannot grant free points', () => {
    for (const config of [{ food: 0, round: 8, wood: 8 }, { food: 5, round: 4, wood: 4 }]) { const s = facades(config); const r = buy(s, FACADES); assert.equal(r.state.players[0]!.resources.food, config.food); assert.equal(bonus(r, FACADES), 0); assertRejectedUnchanged(s, () => s.resolveChoice(0, 'exchange-one-food')) }
  })
  it('A036 N5 declining the food exchange preserves food and prerequisite wood', () => { const s = facades(); const r = decline(s, buy(s, FACADES), FACADES); assert.equal(r.state.players[0]!.resources.food, 5); assert.equal(r.state.players[0]!.resources.wood, 8); assert.equal(r.state.players[0]!.resources.clay, 0); assert.equal(bonus(r, FACADES), 0) })
  it('A036 N6 already played card and actual opponent ordinary action do not repeat on buy', () => {
    const s = facades({ played: true }); let r = ok(s.takeAction(0, 'day-laborer')); assert.equal(bonus(r, FACADES), 0); confirmNext(s, r); r = ok(s.takeAction(1, 'forest')); assert.equal(r.state.players[1]!.resources.wood, 3); assert.equal(r.state.players[0]!.resources.food, 7); assert.equal(bonus(r, FACADES), 0)
  })
  it('A036 N7 paid exchange rejects wrong actor stale replay and whole action undo retries once', () => {
    const s = facades(); const before = undoRuleSnapshot(s.getState()); const r = buy(s, FACADES); const c = options(r).filter(o => o.value !== '__skip__')[1]; assert(c); assertRejectedUnchanged(s, () => s.resolveChoice(1, c.value))
    const after = ok(s.resolveChoice(0, c.value)); assert.equal(after.state.players[0]!.resources.food, 3); assert.equal(bonus(after, FACADES), 2); assertRejectedUnchanged(s, () => s.resolveChoice(0, c.value)); assertUndoRestored(before, s.undoAction()); assert.equal(bonus(accept(s, buy(s, FACADES), 2), FACADES), 2)
  })
  it('A036 N8 two clay and zero reed permit the actual purchase', () => {
    const s = facades({ round: 4, wood: 4, reed: 0 }); const r = buy(s, FACADES)
    const control = facades({ round: 4, wood: 4, reed: 1 }); assert(buy(control, FACADES).state.players[0]!.minorPlayed.includes(FACADES))
    assert.deepEqual({ played: r.state.players[0]!.minorPlayed.includes(FACADES), clay: r.state.players[0]!.resources.clay, reed: r.state.players[0]!.resources.reed, wood: r.state.players[0]!.resources.wood, food: r.state.players[0]!.resources.food, bonus: bonus(r, FACADES) }, { played: true, clay: 0, reed: 0, wood: 4, food: 5, bonus: 0 })
  })
  it('A036 N9 actual purchase consumes two clay and retains reed', () => {
    const s = facades({ round: 4, wood: 4, reed: 1 }); const r = buy(s, FACADES); assert(r.state.players[0]!.minorPlayed.includes(FACADES))
    assert.deepEqual({ clay: r.state.players[0]!.resources.clay, reed: r.state.players[0]!.resources.reed, wood: r.state.players[0]!.resources.wood, food: r.state.players[0]!.resources.food, bonus: bonus(r, FACADES) }, { clay: 0, reed: 1, wood: 4, food: 5, bonus: 0 })
  })
})
