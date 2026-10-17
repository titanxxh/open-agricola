import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as auditD014 from './_helpers/audit/ae-negative-D014'

describe('ae-negative-D014', () => {
  const { CARD, sessions, setup, startBuild, outcome } = auditD014
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  describe('D014 negative audit: current-step construction and undo', () => {
    it('N1 third room enters the designed engine block with complete action undo', () => {
      const session = setup()
      const before = undoRuleSnapshot(session.getState())
      const result = session.commitSelectionChoice(0, { rooms: [startBuild(session)] })
      const actual = outcome(result)
      const undo = session.undoAction()
      assert.equal(undo.ok, true, undo.error)
      assertUndoRestored(before, undo)
      assert.equal(undo.interaction.stateId, 'idle')
      assert.deepEqual(actual, { ok: true, rooms: 3, house: 'clay', clay: 0, reed: 1, stone: 2, blocked: true })
    })
    it('N2 three stone permit building then renovating all three rooms', () => {
      const session = setup(3)
      const result = session.commitSelectionChoice(0, { rooms: [startBuild(session)] })
      assert.deepEqual(outcome(result), { ok: true, rooms: 3, house: 'stone', clay: 0, reed: 0, stone: 0, blocked: false })
      assert.equal(result.scores?.length, 2)
    })
    it('N3 step undo returns to the optional build choice and a legal skip completes renovation', () => {
      const session = setup()
      session.commitSelectionChoice(0, { rooms: [startBuild(session)] })
      let response = session.undoStep()
      assert.equal(response.ok, true, response.error)
      assert.equal(response.state.players[0]!.roomTiles.length, 2)
      response = session.undoStep()
      assert.equal(response.ok, true, response.error)
      response = session.resolveChoice(0, '__skip__')
      assert.deepEqual(outcome(response), { ok: true, rooms: 2, house: 'stone', clay: 5, reed: 2, stone: 0, blocked: false })
    })
    it('N4 wood-to-clay renovation gives no Hammer Crusher reward', () => {
      const session = setup(0, true)
      const result = session.takeAction(0, 'house-redevelopment')
      assert.equal(result.ok, true, result.error)
      assert.equal(result.state.players[0]!.houseType, 'clay')
      assert.deepEqual({ clay: result.state.players[0]!.resources.clay, reed: result.state.players[0]!.resources.reed }, { clay: 1, reed: 1 })
      assert.equal(result.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD).length, 0)
    })
  })
})
