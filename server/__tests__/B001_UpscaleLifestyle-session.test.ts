import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit13Minor from './_helpers/audit/ae-negative-13-minor'

describe('ae-negative-13-minor', () => {
  const { LIFE, sessions, save, ok, setup, enterMinor, buy, optional } = audit13Minor
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('B001 N1 paid passing card grants five clay and normal renovation pays two clay one reed', () => {
    const session = setup(LIFE, 3, state => state.players[0]!.resources.reed = 1)
    let r = optional(session, buy(session, LIFE), true)
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') r = ok(session.resolveChoice(0, 'clay'))
    assert.equal(r.state.players[0]!.houseType, 'clay'); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.clay, 3); assert.equal(r.state.players[0]!.resources.reed, 0); save('B001-N1', r)
  })
  it('B001 N2 declining renovation retains five clay and missing reed cannot create free renovation', () => {
    const session = setup(LIFE, 3, state => state.players[0]!.resources.reed = 1); const declined = optional(session, buy(session, LIFE), false)
    assert.equal(declined.state.players[0]!.houseType, 'wood'); assert.equal(declined.state.players[0]!.resources.clay, 5); assert.equal(declined.state.players[0]!.resources.reed, 1)
    const noReed = buy(setup(LIFE, 3), LIFE); assert.equal(noReed.state.players[0]!.houseType, 'wood'); assert.equal(noReed.state.players[0]!.resources.clay, 5); save('B001-N2', { declined, noReed })
  })
  it('B001 N3 insufficient card wood and invalid actor cannot gain or pass before legal alternative', () => {
    const session = setup(LIFE, 2); const r = enterMinor(session)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); assert(!r.interaction.request.options.some(o => o.value === LIFE && !o.disabled))
    assertRejectedUnchanged(session, () => session.resolveChoice(0, LIFE)); assertRejectedUnchanged(session, () => session.resolveChoice(1, 'A030_BakingSheet'))
    const legal = ok(session.resolveChoice(0, 'A030_BakingSheet')); assert.equal(legal.state.players[0]!.resources.clay, 0); assert.equal(legal.state.players[0]!.resources.wood, 2); assert(legal.state.players[0]!.minorHand.includes(LIFE)); save('B001-N3', legal)
  })
  it('B001 N4 whole renovation undo restores payment reward house and passing', () => {
    const session = setup(LIFE, 3, state => state.players[0]!.resources.reed = 1)
    let r = optional(session, buy(session, LIFE), true); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') r = ok(session.resolveChoice(0, 'clay'))
    const undone = ok(session.undoAction()); assert.equal(undone.state.players[0]!.houseType, 'wood'); assert.equal(undone.state.players[0]!.resources.wood, 3); assert.equal(undone.state.players[0]!.resources.clay, 0); assert.equal(undone.state.players[0]!.resources.reed, 1); assert(undone.state.players[0]!.minorHand.includes(LIFE)); assert(!undone.state.players[1]!.minorHand.includes(LIFE)); save('B001-N4', { r, undone })
  })
  it('B001 N5 stone house keeps five clay without further renovation or stale duplicate reward', () => {
    const session = setup(LIFE, 3, state => { state.players[0]!.houseType = 'stone'; state.players[0]!.resources.reed = 1 })
    const r = buy(session, LIFE); assert.equal(r.state.players[0]!.houseType, 'stone'); assert.equal(r.state.players[0]!.resources.clay, 5); assert.equal(r.state.players[0]!.resources.reed, 1)
    assertRejectedUnchanged(session, () => session.resolveChoice(0, LIFE)); assert.equal(session.getState().state.players[0]!.resources.clay, 5); save('B001-N5', r)
  })
})
