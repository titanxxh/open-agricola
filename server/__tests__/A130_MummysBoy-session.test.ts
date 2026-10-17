import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import { getRoundPersonPlacementDetails } from '../../shared/cards/helpers/round-placement'
import * as audit02Placement from './_helpers/audit/ae-negative-02-placement'

describe('ae-negative-02-placement', () => {
  const { sessions, A130, setup, ok, ready, secondPerson, occupants } = audit02Placement
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  describe('Placement negative audit', () => {
    it('A130 N1 third reuse rejects first and opponent targets and undo restores quota', () => {
      const s = setup(A130, { family: 4 })
      secondPerson(s)
      assertRejectedUnchanged(s, () => s.takeAction(0, 'forest'))
      assertRejectedUnchanged(s, () => s.takeAction(0, 'clay-pit'))
      const before = undoRuleSnapshot(s.getState())
      const r = ok(s.takeAction(0, 'day-laborer'))
      assert.equal(r.state.players[0]!.resources.food, 4)
      assert.equal(occupants(r, 'day-laborer').length, 2)
      assert.equal(r.state.players[0]!.cardStates[A130]?.flagged, true)
      assert.equal(getRoundPersonPlacementDetails(r.state.players[0]!).length, 3)
      assert.ok(r.scores)
      assert.equal(r.scores.length, 3)
      assert.ok(r.state.log.some(l => l.key === 'log.placeFarmer'))
      assertUndoRestored(before, s.undoAction())
      const retried = ok(s.takeAction(0, 'day-laborer'))
      assert.equal(retried.state.players[0]!.resources.food, 4)
      assert.equal(occupants(retried, 'day-laborer').length, 2)
    })

    it('A130 N2 Meeting Place second person cannot be reused and legal placement remains', () => {
      const s = setup(A130, { family: 3 })
      secondPerson(s, 'meeting-place')
      assertRejectedUnchanged(s, () => s.takeAction(0, 'meeting-place'))
      let r = ok(s.takeAction(0, 'farmland'))
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'plow')
      r = ok(s.commitSelectionChoice(0, { tile: r.interaction.request.farm.selectableTiles[0]! }))
      assert.equal(occupants(r, 'meeting-place').length, 1)
      assert.equal(r.state.players[0]!.cardStates[A130]?.flagged, undefined)
      assert.equal(occupants(r, 'farmland').length, 1)
    })

    it('A130 N3 fourth reuse is rejected and a new round renews the allowance', () => {
      const s = setup(A130, { family: 4 })
      secondPerson(s)
      ok(s.takeAction(0, 'day-laborer'))
      ready(s, 0)
      assertRejectedUnchanged(s, () => s.takeAction(0, 'day-laborer'))
      let r = ok(s.takeAction(0, 'farmland'))
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'plow')
      r = ok(s.commitSelectionChoice(0, { tile: r.interaction.request.farm.selectableTiles[0]! }))
      assert.equal(r.state.players[0]!.resources.food, 4)
      ready(s, 0)
      assert.equal(s.state.round, 6)
      assert.equal(s.state.players[0]!.cardStates[A130]?.flagged, false)
      secondPerson(s)
      const next = ok(s.takeAction(0, 'day-laborer'))
      assert.equal(next.state.players[0]!.resources.food, 8)
      assert.equal(occupants(next, 'day-laborer').length, 2)
    })
  })
})
