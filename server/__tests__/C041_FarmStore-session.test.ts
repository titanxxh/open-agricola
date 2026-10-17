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
  const { options, pairs, farmStore, storeObserved, storeChoice, exchange } = audit03Costs
  it('C041 N1 OA after feeding exactly one food buys one vegetable', () => {
    const s = farmStore()
    try {
      const r = exchange(s, storeChoice(s, s.performRoundEnd()), { vegetable: 1 }).r
      assert.deepEqual(storeObserved(r), { food: 0, vegetable: 1, wood: 0, clay: 0, reed: 0, stone: 0 })
    } finally { s.dispose() }
  })
  it('C041 N2 OA each of six distinct building pairs has exactly one of each resource', () => {
    for (const pair of pairs) {
      const s = farmStore()
      try {
        const r = exchange(s, storeChoice(s, s.performRoundEnd()), pair).r
        assert.deepEqual(storeObserved(r), { food: 0, vegetable: 0, wood: 0, clay: 0, reed: 0, stone: 0, ...pair })
      } finally { s.dispose() }
    }
  })
  it('C041 N3 OA declining after feeding preserves the final food and grants nothing', () => {
    const s = farmStore()
    try {
      storeChoice(s, s.performRoundEnd())
      const r = s.resolveChoice(0, '__skip__')
      assert.equal(r.ok, true, r.error)
      assert.deepEqual(storeObserved(r), { food: 1, vegetable: 0, wood: 0, clay: 0, reed: 0, stone: 0 })
    } finally { s.dispose() }
  })
  it('C041 N4 OA no food after feeding skips the exchange without free goods', () => {
    const s = farmStore(4)
    try {
      const r = s.performRoundEnd()
      assert.equal(r.ok, true, r.error)
      assert.deepEqual(storeObserved(r), { food: 0, vegetable: 0, wood: 0, clay: 0, reed: 0, stone: 0 })
      assert.ok(r.interaction.stateId !== 'wait' || r.interaction.sourceCard !== 'C041_FarmStore')
    } finally { s.dispose() }
  })
  it('C041 N5 OA same resource twice and repeated harvest exchange reject before legal reward', () => {
    const s = farmStore(6)
    try {
      const r = s.performRoundEnd()
      assert.equal(r.state.players[0]!.resources.food, 2)
      const offered = options(r)
      assert.equal(offered.some(o => o.effectPreview?.kind === 'resourceExchange' && (o.effectPreview.resourcesGained?.wood ?? 0) >= 2), false)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, 'wood:2'))
      const selected = exchange(s, r, { wood: 1, clay: 1 })
      assert.deepEqual(storeObserved(selected.r), { food: 1, vegetable: 0, wood: 1, clay: 1, reed: 0, stone: 0 })
      assertRejectedUnchanged(s, () => s.resolveChoice(0, selected.value))
    } finally { s.dispose() }
  })
  it('C041 N6 OA non harvest round end never offers the exchange', () => {
    const s = farmStore(5, 5)
    try {
      const r = s.performRoundEnd()
      assert.equal(r.ok, true, r.error)
      assert.equal(r.state.round, 6)
      assert.deepEqual(storeObserved(r), { food: 5, vegetable: 0, wood: 0, clay: 0, reed: 0, stone: 0 })
    } finally { s.dispose() }
  })
  it('C041 N7 OA completed harvest exposes no undo history and denial changes no goods', () => {
    const s = farmStore()
    try {
      const r = exchange(s, storeChoice(s, s.performRoundEnd()), { vegetable: 1 }).r
      assert.deepEqual(storeObserved(r), { food: 0, vegetable: 1, wood: 0, clay: 0, reed: 0, stone: 0 })
      assertRejectedUnchanged(s, () => s.undoStep())
    } finally { s.dispose() }
  })
})
