import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit57Livestock from './_helpers/audit/ae-negative-57-livestock'

describe('ae-negative-57-livestock', () => {
  const { sessions, ok, save, make, pasture, finish, choose, count, ready } = audit57Livestock
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('E164 N1 actual ordinary Farmland plows one field and gives one sheep with occupied target rejection before legal retry', () => {
    const session = make('E164_MountainPlowman'), pending = ok(session.takeAction(0, 'farmland')), rejected = assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { tile: { row: 1, col: 0 } }))
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'farm-select' && pending.interaction.request.farm.farmType === 'plow')
    const response = finish(session, ok(session.commitSelectionChoice(0, { tile: pending.interaction.request.farm.selectableTiles[0]! })))
    assert.equal(response.state.players[0]!.fields.length, 1); assert.deepEqual(count(response), [1, 0, 0])
    save('E164-N1', { pending, rejected, response })
  })
  it('E164 N2 real Farmland with two stored extra plows gains exactly one sheep for each of three new fields', () => {
    const session = make('E164_MountainPlowman', state => { const p = state.players[0]!; p.occupationPlayed.push('A110_Roughcaster', 'A125_Priest'); p.minorHand = ['C019_SwingPlow', 'B004_WoodPile']; p.resources.wood = 3; pasture(p, null, 0, true) })
    let pending = ok(session.takeAction(0, 'meeting-place'))
    if (pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice' && !pending.interaction.request.options.some(option => option.value === 'C019_SwingPlow')) pending = choose(session, pending, option => option.labelKey === 'actions.improvement.name' || option.value.startsWith('action-improvement-'))
    const purchased = finish(session, choose(session, pending, option => option.value === 'C019_SwingPlow'))
    assert.equal(purchased.state.players[0]!.resources.wood, 0)
    assert.equal(purchased.state.players[0]!.cardStates.C019_SwingPlow?.stack?.length, 4)
    for (const [actor, space] of [[1, 'grain-seeds'], [2, 'clay-pit'], [3, 'reed-bank']] as const) { assert.equal(ready(session).state.currentPlayerIndex, actor); finish(session, ok(session.takeAction(actor, space))) }
    assert.equal(ready(session).state.currentPlayerIndex, 0)
    const response = finish(session, ok(session.takeAction(0, 'farmland')), true)
    assert.equal(response.state.players[0]!.fields.length, 3); assert.deepEqual(count(response), [3, 0, 0]); assert.equal(response.state.players[0]!.cardStates.C019_SwingPlow?.stack?.length, 2)
    save('E164-N2', { pending, purchased, response })
  })
  it('E164 N3 unrelated placement and card in hand never grant sheep while whole plow undo restores farm and animals', () => {
    const hand = make('E164_MountainPlowman', undefined, false), handResponse = finish(hand, ok(hand.takeAction(0, 'farmland')), true), other = make('E164_MountainPlowman'), control = finish(other, ok(other.takeAction(0, 'grain-seeds')))
    assert.deepEqual(count(handResponse), [0, 0, 0]); assert.equal(handResponse.state.players[0]!.fields.length, 1); assert.deepEqual(count(control), [0, 0, 0])
    const session = make('E164_MountainPlowman'), response = finish(session, ok(session.takeAction(0, 'farmland')), true), undone = ok(session.undoAction())
    assert.deepEqual(count(response), [1, 0, 0]); assert.deepEqual(count(undone), [0, 0, 0]); assert.equal(undone.state.players[0]!.fields.length, 0)
    save('E164-N3', { handResponse, control, response, undone })
  })
})
