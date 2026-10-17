import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { familySize } from '../../shared/domain/player'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit05Population from './_helpers/audit/ae-negative-05-population'

describe('ae-negative-05-population', () => {
  const { HOME, sessions, ok, setRooms, setup, denied, buy, construct } = audit05Population
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A021 N1 missing own occupation rejects forged purchase before legal free purchase', () => {
    denied(setup(HOME, { played: false, occupations: 0 }), HOME)
    const s = setup(HOME, { played: false })
    const r = buy(s, HOME)
    assert(r.state.players[0]!.minorPlayed.includes(HOME)); assert.equal(r.state.players[0]!.resources.food, 20)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, HOME))
  })
  it('A021 N2 adding the first spare room does not qualify a previously full house', () => {
    const s = setup(HOME, { rooms: 2, resources: { wood: 5, reed: 2 } }); construct(s)
    const r = ok(s.commitSelectionChoice(0, { rooms: [{ row: 2, col: 0 }], stables: [] }))
    assert.equal(r.state.players[0]!.rooms, 3); assert.equal(familySize(r.state.players[0]!), 2); assert.equal(r.state.players[0]!.resources.food, 20)
  })
  it('A021 N3 two real rooms grant exactly one child and one food with whole-action undo', () => {
    const s = setup(HOME, { resources: { wood: 10, reed: 4 } }); const before = undoRuleSnapshot(s.getState()); construct(s)
    const r = ok(s.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }], stables: [] }))
    assert.equal(r.state.players[0]!.rooms, 5); assert.equal(familySize(r.state.players[0]!), 3)
    assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.reed, r.state.players[0]!.resources.food], [0, 0, 21])
    assertUndoRestored(before, s.undoAction())
    construct(s)
    const retry = ok(s.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }], stables: [] }))
    assert.equal(familySize(retry.state.players[0]!), 3); assert.equal(retry.state.players[0]!.resources.food, 21)
  })
  it('A021 N4 stable only and actual opponent room construction do not grant owner growth', () => {
    const s = setup(HOME, { resources: { wood: 2 } }); construct(s)
    const stable = ok(s.commitSelectionChoice(0, { rooms: [], stables: [{ row: 0, col: 1 }] }))
    assert.equal(stable.state.players[0]!.stableTiles.length, 1); assert.equal(familySize(stable.state.players[0]!), 2); assert.equal(stable.state.players[0]!.resources.food, 20)
    const other = setup(HOME, {}, state => { setRooms(state, 3, 1); Object.assign(state.players[1]!.resources, { wood: 5, reed: 2 }) })
    confirmNext(other, ok(other.takeAction(0, 'grain-seeds'))); construct(other, 1)
    const r = ok(other.commitSelectionChoice(1, { rooms: [{ row: 1, col: 1 }], stables: [] }))
    assert.equal(r.state.players[1]!.rooms, 4); assert.equal(familySize(r.state.players[0]!), 2); assert.equal(familySize(r.state.players[1]!), 2)
    assert.equal(r.state.players[0]!.resources.food, 20); assert.equal(r.state.players[1]!.resources.food, 20)
  })
  it('A021 N5 family remains at five and food observation awaits an independent ruling', () => {
    const s = setup(HOME, { rooms: 6, people: 5, resources: { wood: 5, reed: 2 } }); construct(s)
    const r = ok(s.commitSelectionChoice(0, { rooms: [{ row: 0, col: 2 }], stables: [] }))
    assert.equal(r.state.players[0]!.rooms, 7); assert.equal(familySize(r.state.players[0]!), 5); assert.equal(r.state.players[0]!.resources.food, 20)
  })
  it('A021 N6 granted family growth does not inherit optional minor improvement', () => {
    const s = setup(HOME, { resources: { wood: 5, reed: 2 } }, state => { state.players[0]!.minorHand = ['B007_Wage'] }); construct(s)
    const r = ok(s.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }], stables: [] }))
    assert.equal(familySize(r.state.players[0]!), 3); assert(r.state.players[0]!.minorHand.includes('B007_Wage'))
    assert.equal(r.interaction.stateId, 'wait')
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'B007_Wage'))
  })
})
