import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged, assertRuleOutcome, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import { familySize, workersAvailable } from '../../shared/domain/player'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'
import * as audit02Placement from './_helpers/audit/ae-negative-02-placement'

describe('ae-negative-02-placement', () => {
  const { sessions, E151, ok, occupants, nurseSetup, nurseGrowth, nurseTotals, finishNurseRound } = audit02Placement
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  describe('Delivery Nurse negative audit', () => {
    it('E151 N1 no-room growth consumes once and undo restores animals worker and flag', () => {
      const s = nurseSetup()
      const before = undoRuleSnapshot(s.getState())
      const { r, offer } = nurseGrowth(s)
      assert.equal(offer, true)
      assert.deepEqual(nurseTotals(r), { family: 3, sheep: 1, boar: 1, cattle: 1, food: 0, used: true })
      assert.equal(occupants(r, 'wish-children').length, 2)
      assert.ok(r.scores)
      assert.equal(r.scores.length, 4)
      assert.ok(r.state.events.some(e => e.type === 'card.triggered' && e.sourceCardId === E151))
      assertUndoRestored(before, s.undoAction())
      const retry = nurseGrowth(s).r
      assert.deepEqual(nurseTotals(retry), { family: 3, sheep: 1, boar: 1, cattle: 1, food: 0, used: true })
    })
    it('E151 N2 missing cattle cannot bypass room and normal placement remains legal', () => {
      const s = nurseSetup({ missing: true })
      assertRejectedUnchanged(s, () => s.takeAction(0, 'wish-children'))
      const r = ok(s.takeAction(0, 'grain-seeds'))
      assert.equal(familySize(r.state.players[0]!), 2)
      assert.equal(r.state.players[0]!.resources.grain, 1)
      assert.equal(nurseTotals(r).used, false)
    })
    it('E151 N3 five active family members cannot grow a sixth', () => {
      const s = nurseSetup({ family: 5 })
      assertRejectedUnchanged(s, () => s.takeAction(0, 'wish-children'))
      const r = ok(s.takeAction(0, 'grain-seeds'))
      assert.equal(familySize(r.state.players[0]!), 5)
      assert.equal(workersAvailable(r.state, r.state.players[0]!), 4)
      assert.equal(nurseTotals(r).used, false)
    })
    it('E151 N4 a real prior use never bypasses room again next round', () => {
      const s = nurseSetup()
      nurseGrowth(s)
      finishNurseRound(s)
      assert.equal(s.state.round, 11)
      assert.equal(familySize(s.state.players[0]!), 3)
      assertRejectedUnchanged(s, () => s.takeAction(0, 'wish-children'))
      const r = ok(s.takeAction(0, 'grain-seeds'))
      assert.equal(nurseTotals(r).used, true)
      assert.equal(familySize(r.state.players[0]!), 3)
      assert.equal(r.state.players[0]!.resources.grain, 2)
    })
    it('E151 N5 existing Wooden Shed room must not consume the no-room allowance', () => {
      const s = nurseSetup({ shed: true })
      assert.equal(s.withCtx(() => getExtraRoomCapacity(s.state.players[0]!)), 1)
      const { r, offer } = nurseGrowth(s)
      const usedAfterNormal = nurseTotals(r).used
      const firstFamily = familySize(r.state.players[0]!)
      finishNurseRound(s)
      assert.equal(s.state.round, 11)
      const second = s.takeAction(0, 'wish-children')
      if (second.ok && second.interaction.stateId === 'wait' && second.interaction.request.kind === 'choice') {
        const source = second.interaction.request.options.find(o => o.sourceCard === E151)
        assert.ok(source)
        ok(s.resolveChoice(0, source.value))
      }
      assertRuleOutcome({ firstFamily, illegalOffer: offer, usedAfterNormal,
        secondGrowth: second.ok, secondFamily: familySize(s.state.players[0]!) },
        { firstFamily: 3, illegalOffer: false, usedAfterNormal: false, secondGrowth: true, secondFamily: 4 })
    })
    it('E151 N6 intrinsic no-room Urgent Wish never consumes the card allowance', () => {
      const s = nurseSetup({ round: 14 })
      const { r, offer } = nurseGrowth(s, 'urgent-wish-children')
      assert.equal(offer, false)
      assert.deepEqual(nurseTotals(r), { family: 3, sheep: 1, boar: 1, cattle: 1, food: 0, used: false })
    })
  })
})
