import '../../shared/cards/D/D117_WoodExpert'
import '../../shared/cards/D/D033_SummerHouse'
import '../../shared/cards/B/B081_Handcart'
import '../../shared/cards/B/B007_Wage'
import '../../shared/cards/E/E047_SyrupTap'
import '../../shared/cards/E/E030_ChildsToy'
import '../../shared/cards/E/E156_ClaypitOwner'
import '../../shared/cards/C/C041_FarmStore'
import '../../shared/cards/C/C122_Bricklayer'
import '../../shared/cards/C/C054_MarketBooth'
import assert from 'node:assert/strict'
import { it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit03Costs from './_helpers/audit/ae-negative-03-costs'

describe('ae-negative-03-costs', () => {
  const { options, enterImprovement, chooseCard, claypit, toOpponent, clayObserved, finishForeign } = audit03Costs
  it('E156 N1 OA printed clay alternative rewards owner even when opponent actually pays wood', () => {
    const s = claypit()
    try {
      toOpponent(s)
      const r = finishForeign(s, chooseCard(s, enterImprovement(s, 1), 'E030_ChildsToy', 1))
      assert.equal(r.ok, true, r.error)
      assert.deepEqual(clayObserved(r), { ownerFood: 1, ownerClay: 1, actorWood: 0, built: true })
    } finally { s.dispose() }
  })
  it('E156 N2 OA owners own printed clay improvement never rewards itself', () => {
    const s = claypit({ self: true })
    try {
      const r = chooseCard(s, enterImprovement(s), 'E030_ChildsToy')
      assert.equal(r.ok, true, r.error)
      assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.resources.clay], [0, 0])
      assert.ok(r.state.players[0]!.minorPlayed.includes('E030_ChildsToy'))
    } finally { s.dispose() }
  })
  it('E156 N3 OA opponents non clay improvement does not reward the owner', () => {
    const s = claypit()
    try {
      toOpponent(s)
      const r = chooseCard(s, enterImprovement(s, 1), 'E047_SyrupTap', 1)
      assert.equal(r.ok, true, r.error)
      assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.resources.clay], [0, 0])
      assert.ok(r.state.players[1]!.minorPlayed.includes('E047_SyrupTap'))
    } finally { s.dispose() }
  })
  it('E156 N4 OA rejected unpaid printed clay purchase leaves no reward before free retry', () => {
    const s = claypit({ wood: 0 })
    try {
      toOpponent(s)
      const r = enterImprovement(s, 1)
      assert.equal(options(r).some(o => o.value === 'E030_ChildsToy'), false)
      assertRejectedUnchanged(s, () => s.resolveChoice(1, 'E030_ChildsToy'))
      const retry = chooseCard(s, r, 'B007_Wage', 1)
      assert.deepEqual(clayObserved(retry), { ownerFood: 0, ownerClay: 0, actorWood: 0, built: false })
      assert.equal(retry.state.players[1]!.resources.food, 2)
    } finally { s.dispose() }
  })
  it('E156 N5 OA stale repeated opponent purchase cannot award the owner twice', () => {
    const s = claypit()
    try {
      toOpponent(s)
      const r = finishForeign(s, chooseCard(s, enterImprovement(s, 1), 'E030_ChildsToy', 1))
      assert.deepEqual(clayObserved(r), { ownerFood: 1, ownerClay: 1, actorWood: 0, built: true })
      assertRejectedUnchanged(s, () => s.resolveChoice(1, 'E030_ChildsToy'))
    } finally { s.dispose() }
  })
  it('E156 N6 OA undo before foreign confirmation restores purchase and leaves no reward', () => {
    const s = claypit()
    try {
      toOpponent(s)
      chooseCard(s, enterImprovement(s, 1), 'E030_ChildsToy', 1)
      const undone = s.undoAction()
      assert.equal(undone.ok, true, undone.error)
      assert.deepEqual(clayObserved(undone), { ownerFood: 0, ownerClay: 0, actorWood: 1, built: false })
      assert.equal(undone.state.players[0]!.resources.grain, 1)
      assert.equal(undone.state.actionSpaces.flatMap(space => space.takenBy).filter(worker => worker.playerId === undone.state.players[1]!.id).length, 0)
      const retry = finishForeign(s, chooseCard(s, enterImprovement(s, 1), 'E030_ChildsToy', 1))
      assert.deepEqual(clayObserved(retry), { ownerFood: 1, ownerClay: 1, actorWood: 0, built: true })
    } finally { s.dispose() }
  })
  it('E156 N7 OA printed clay rewards survive Bricklayers complete actual clay discount', () => {
    const s = claypit({ wood: 0, discounted: true })
    try {
      toOpponent(s)
      const r = finishForeign(s, chooseCard(s, enterImprovement(s, 1), 'E030_ChildsToy', 1))
      assert.deepEqual(clayObserved(r), { ownerFood: 1, ownerClay: 1, actorWood: 0, built: true })
      assert.equal(r.state.players[1]!.resources.clay, 0)
    } finally { s.dispose() }
  })
  it('E156 N8 OA opponents printed clay major Fireplace rewards the owner exactly once', () => {
    const s = claypit({ wood: 0, clay: 2 })
    try {
      toOpponent(s)
      const r = finishForeign(s, chooseCard(s, enterImprovement(s, 1, 'major-improvement'), 'Major_Fireplace1', 1))
      assert.equal(r.ok, true, r.error)
      assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.resources.clay, r.state.players[1]!.resources.clay], [1, 1, 0])
      assert.ok(r.state.players[1]!.improvements.includes('Major_Fireplace1'))
    } finally { s.dispose() }
  })
})
