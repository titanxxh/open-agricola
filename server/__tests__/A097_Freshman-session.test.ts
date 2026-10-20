import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit12Replacement from './_helpers/audit/ae-negative-12-replacement'

describe('ae-negative-12-replacement', () => {
  const { FRESH, OCC, sessions, save, ok, setup, turn, replacement } = audit12Replacement
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('A097 N1 grainless Bake replacement plays occupation free and rejects other actor and unknown card', () => {
    const session = setup(FRESH, state => { state.players[0]!.occupationHand = [OCC, 'A116_WoodCutter']; state.players[0]!.resources.food = 0 })
    let response = replacement(session, turn(session, 0, 'grain-utilization'), FRESH)
    assertRejectedUnchanged(session, () => session.resolveChoice(1, OCC)); assertRejectedUnchanged(session, () => session.resolveChoice(0, 'does-not-exist'))
    response = ok(session.resolveChoice(0, OCC)); assert.equal(response.state.players[0]!.resources.food, 0); assert.ok(response.state.players[0]!.occupationPlayed.includes(OCC)); assert.ok(response.state.players[0]!.occupationHand.includes('A116_WoodCutter')); save('A097-N1', response)
  })
  it('A097 N2 no playable occupation or unplayed Freshman cannot make grainless space available', () => {
    for (const session of [setup(FRESH), setup(FRESH, state => state.players[0]!.occupationHand = [OCC], 14, false)]) {
      assert.equal(session.getActionAvailability(0)['grain-utilization'], false); const response = assertRejectedUnchanged(session, () => session.takeAction(0, 'grain-utilization')); save(`A097-N2-${response.state.players[0]!.occupationPlayed.length}`, response)
    }
  })
  it('A097 N3 Bread Paddle cannot reuse Freshman within the same placement', () => {
    const session = setup(FRESH, state => { state.players[0]!.occupationHand = [OCC, 'A116_WoodCutter']; state.players[0]!.minorPlayed = ['B025_BreadPaddle']; state.players[0]!.resources.food = 0 })
    let response = replacement(session, turn(session, 0, 'grain-utilization'), FRESH); response = ok(session.resolveChoice(0, OCC))
    assert.equal(response.interaction.stateId === 'wait' ? response.interaction.request.kind : '', 'confirm-next-player')
    assert.ok(response.state.players[0]!.occupationHand.includes('A116_WoodCutter')); assert.equal(response.state.players[0]!.resources.food, 0); assert.equal(response.interaction.stateId === 'wait' ? response.interaction.request.kind : '', 'confirm-next-player'); save('A097-N3', response)
  })
  it('A097 N4 Blighter veto cannot be bypassed by a free occupation replacement', () => {
    const session = setup(FRESH, state => { state.players[0]!.occupationPlayed.push('E101_Blighter'); state.players[0]!.occupationHand = [OCC] })
    assert.equal(session.getActionAvailability(0)['grain-utilization'], false); const response = assertRejectedUnchanged(session, () => session.takeAction(0, 'grain-utilization')); assert.ok(response.state.players[0]!.occupationHand.includes(OCC)); save('A097-N4', response)
  })
})
