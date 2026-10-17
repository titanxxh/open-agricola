import { describe, expect, it, afterEach } from 'vitest'
import { playMinor, setupMinorSession } from './_helpers/batch07-card-play'

import '../../shared/cards/A/A062_BeerKeg'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit09Harvest from './_helpers/audit/ae-negative-09-harvest'

describe('A062 Beer Keg through Session', () => {
  it('requires two grain in supply without spending them', () => {
    const blocked = playMinor(setupMinorSession({
      cardId: 'A062_BeerKeg', resources: { wood: 1, grain: 1 },
    }), 'A062_BeerKeg')
    expect(blocked.state.players[0]!.minorPlayed).not.toContain('A062_BeerKeg')
    expect(blocked.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 1 })

    const played = playMinor(setupMinorSession({
      cardId: 'A062_BeerKeg', resources: { wood: 1, grain: 2 },
    }), 'A062_BeerKeg')
    expect(played.state.players[0]!.minorPlayed).toContain('A062_BeerKeg')
    expect(played.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 2 })
  })
})

describe('ae-negative-09-harvest', () => {
  const { CREDIT, sessions, setup, opts, buy, deny, gainCount, resource, endWork, finishHarvest, purchaseUndo, save, beer, bonus, amountPaid } = audit09Harvest
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A062 N1 grain and wood shortage reject forged purchase before exact control', () => {
    for (const resources of [{ wood: 1, grain: 0, food: 0 }, { wood: 1, grain: 1, food: 0 }, { wood: 0, grain: 2, food: 0 }]) deny(setup({ played: false, resources }), CREDIT)
    const r = buy(setup({ played: false, resources: { wood: 1, grain: 2, food: 0 } }), CREDIT); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.grain, 2); assert.ok(r.state.players[0]!.minorPlayed.includes(CREDIT))
  })
  for (const { n, amount, testName } of [
    { n: 2, amount: 1, testName: 'A062 N2 feeding 1 grain gives exactly three food and 0 bonus once' },
    { n: 3, amount: 2, testName: 'A062 N3 feeding 2 grain gives exactly three food and 1 bonus once' },
    { n: 4, amount: 3, testName: 'A062 N4 feeding 3 grain gives exactly three food and 2 bonus once' },
  ]) it(testName, () => {
    const s = setup({ resources: { grain: amount, food: 1 }, opponent: { food: 4 } }); const offer = endWork(s); save(`A062-N${n}-offer`, offer); const paid = beer(s, offer, amount); save(`A062-N${n}-post-exchange`, paid); resource(paid, 'food', 0); assert.equal(paid.state.players[0]!.resources.grain, 0); assert.equal(bonus(paid), amount - 1); const done = finishHarvest(s, paid); save(`A062-N${n}-done`, done); resource(done, 'food', 0); resource(done, 'begging', 0); assert.equal(done.state.round, 5); assert.equal(gainCount(done, CREDIT), 1); assertRejectedUnchanged(s, () => s.resolveChoice(0, '0'))
  })
  it('A062 N5 unaffordable and invalid exchange reject before one grain retry', () => {
    const s = setup({ resources: { grain: 1, food: 1 } }); const r = endWork(s); save('A062-N5-offer', r); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice'); const enabled = r.interaction.request.options.filter(o => !o.disabled && amountPaid(r, o.value, 'grain') !== undefined).map(o => amountPaid(r, o.value, 'grain')); assert.deepEqual(enabled, [1]); for (const o of r.interaction.request.options.filter(o => amountPaid(r, o.value, 'grain') === 2 || amountPaid(r, o.value, 'grain') === 3)) assertRejectedUnchanged(s, () => s.resolveChoice(0, o.value)); assertRejectedUnchanged(s, () => s.resolveChoice(0, '999')); const done = finishHarvest(s, beer(s, r, 1)); resource(done, 'food', 0); assert.equal(done.state.players[0]!.resources.grain, 0); assert.equal(bonus(done), 0)
  })
  it('A062 N6 decline no card and in hand controls grant no food or bonus', () => {
    for (const config of [{}, { played: false }, { noCard: true }]) { const s = setup({ ...config, resources: { grain: 3, food: 4 }, opponent: { food: 4 } }); const r = finishHarvest(s, endWork(s)); save(`A062-N6-${JSON.stringify(config)}`, r); resource(r, 'food', 0); assert.equal(r.state.players[0]!.resources.grain, 3); assert.equal(bonus(r), 0); assert.equal(gainCount(r, CREDIT), 0) }
  })
  it('A062 N7 foreign actor and nonharvest phase cannot use owner exchange', () => {
    const s = setup({ resources: { grain: 2, food: 4 }, opponent: { grain: 3, food: 4 } }); const offer = endWork(s); const first = opts(offer).find(o => o.value !== '__skip__'); assert.ok(first); assertRejectedUnchanged(s, () => s.resolveChoice(1, first.value)); const done = finishHarvest(s, beer(s, offer, 2)); resource(done, 'food', 3); resource(done, 'food', 2, 1); assert.equal(done.state.players[1]!.resources.grain, 3); assert.equal(bonus(done), 1)
    const wrong = setup({ round: 3, resources: { grain: 2, food: 4 } }); const r = endWork(wrong); assert.equal(r.state.round, 4); resource(r, 'food', 4); assert.equal(r.state.players[0]!.resources.grain, 2); assert.equal(gainCount(r, CREDIT), 0); assertRejectedUnchanged(wrong, () => wrong.resolveChoice(0, first.value))
  })
  it('A062 N8 purchase undo restores wood grain and card before legal replay', () => {
    const s = setup({ played: false, resources: { wood: 1, grain: 2, food: 0 } }); const before = undoRuleSnapshot(s.getState()); buy(s, CREDIT); purchaseUndo(before, s.undoAction()); const r = buy(s, CREDIT); resource(r, 'wood', 0); assert.equal(r.state.players[0]!.resources.grain, 2); assert.equal(bonus(r), 0)
  })
})
