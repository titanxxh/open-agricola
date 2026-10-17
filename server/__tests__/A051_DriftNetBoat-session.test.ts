import '../../shared/cards/A/A051_DriftNetBoat'
import '../../shared/cards/A/A052_ThrowingAxe'
import '../../shared/cards/A/A053_Claypipe'
import '../../shared/cards/A/A006_StorageBarn'
import assert from 'node:assert/strict'
import { afterEach, describe } from 'vitest'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit08Triggers from './_helpers/audit/ae-negative-08-triggers'

describe('ae-negative-08-triggers', () => {
  const { BOAT, sessions, scenario, setup, ready, turn, enter, buy, values, bonus, retryFree } = audit08Triggers
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  scenario('A051 N1 actual purchase pays one wood and one reed and earns one printed point', () => {
    const s = setup(BOAT, { played: false, resources: { wood: 1, reed: 1 } }); const r = buy(s, enter(s), BOAT)
    assert.ok(r.scores); const score = r.scores[0]!.categories.find(c => c.key === 'cards')?.entries.find(e => e.type === 'card' && e.cardId === BOAT)?.score; assert.equal(score, 1)
    assert.equal(values(r).wood, 0); assert.equal(values(r).reed, 0); assert.equal(values(r).food, 20); bonus(r, BOAT, 0); return { paid: { wood: 1, reed: 1 }, wood: 0, reed: 0, score }
  })
  scenario('A051 N2 missing reed rejects a forged purchase before a legal free card retry', () => {
    const s = setup(BOAT, { played: false, resources: { wood: 1 } }); const r = retryFree(s, BOAT); assert.equal(values(r).wood, 1); assert.equal(values(r).reed, 0); assert.equal(r.state.players[0]!.minorHand.includes(BOAT), true); return { wood: 1, reed: 0, cardInHand: true }
  })
  scenario('A051 N3 missing wood rejects a forged purchase before a legal free card retry', () => {
    const s = setup(BOAT, { played: false, resources: { reed: 1 } }); const r = retryFree(s, BOAT); assert.equal(values(r).wood, 0); assert.equal(values(r).reed, 1); assert.equal(r.state.players[0]!.minorHand.includes(BOAT), true); return { wood: 0, reed: 1, cardInHand: true }
  })
  scenario('A051 N4 stocked Fishing gives two accumulated and two supplemental food', () => { const r = turn(setup(BOAT), 0, 'fishing'); assert.equal(values(r).food, 24); bonus(r, BOAT, 2); return { food: 24 } })
  scenario('A051 N5 ordinary Day Laborer and Credit food gains give no Fishing bonus', () => { const r = turn(setup(BOAT), 0, 'day-laborer'); assert.equal(values(r).food, 22); bonus(r, BOAT, 0); const s = setup(BOAT); const q = buy(s, enter(s), 'A054_Credit'); assert.equal(values(q).food, 25); bonus(q, BOAT, 0); return { dayFood: 22, creditFood: 25 } })
  scenario('A051 N6 Forest gives wood without a Fishing bonus', () => { const r = turn(setup(BOAT), 0, 'forest'); assert.equal(values(r).wood, 3); assert.equal(values(r).food, 20); bonus(r, BOAT, 0); return { wood: 3, food: 20 } })
  scenario('A051 N7 opponent Fishing cannot grant owner supplemental food', () => { const s = setup(BOAT); turn(s, 0, 'grain-seeds'); const r = turn(s, 1, 'fishing'); assert.equal(values(r).food, 20); assert.equal(values(r, 1).food, 22); bonus(r, BOAT, 0); return { ownerFood: 20, opponentFood: 22 } })
  scenario('A051 N8 Fishing while the card is in hand gives accumulated food only', () => { const r = turn(setup(BOAT, { played: false }), 0, 'fishing'); assert.equal(values(r).food, 22); bonus(r, BOAT, 0); return { food: 22 } })
  scenario('A051 N9 empty Fishing rejects without supplemental food', () => { const s = setup(BOAT, { fishing: 0 }); const r = assertEmptyAccumulationRejected(s, 0, 'fishing'); assert.equal(values(r).food, 20); bonus(r, BOAT, 0); return { emptyEntryRejected: true, supplementalFood: 0 } })
  scenario('A051 N10 occupied Fishing rejects a repeated request before a legal retry', () => { const s = setup(BOAT); turn(s, 0, 'fishing'); turn(s, 1, 'forest'); ready(s, 0); assertRejectedUnchanged(s, () => s.takeAction(0, 'fishing')); const r = turn(s, 0, 'grain-seeds'); assert.equal(values(r).food, 24); assert.equal(values(r).grain, 1); return { food: 24, grain: 1 } })
  scenario('A051 N11 undo restores Fishing stock and bonus before one legal retry', () => { const s = setup(BOAT); const before = undoRuleSnapshot(s.getState()); turn(s, 0, 'fishing'); assertUndoRestored(before, s.undoAction()); const r = turn(s, 0, 'fishing'); assert.equal(values(r).food, 24); bonus(r, BOAT, 2); return { oaRestored: true, retryFood: 24 } })
})
