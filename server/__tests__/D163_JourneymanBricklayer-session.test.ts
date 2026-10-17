import { describe, expect, it, afterEach } from 'vitest'
import { playOccupation, setupOccupationSession } from './_helpers/batch07-card-play'

import '../../shared/cards/D/D163_JourneymanBricklayer'
import assert from 'node:assert/strict'
import * as audit57Phase from './_helpers/audit/ae-negative-57-phase'

describe('D163 Journeyman Bricklayer through Session', () => {
  it('gives two stone exactly once when played', () => {
    const session = setupOccupationSession({ cardId: 'D163_JourneymanBricklayer', playerCount: 4 })
    const response = playOccupation(session, 'D163_JourneymanBricklayer')
    expect(response.state.players[0]!.occupationPlayed).toContain('D163_JourneymanBricklayer')
    expect(response.state.players[0]!.resources.stone).toBe(2)
    session.loadState(response.state)
    expect(session.getState().state.players[0]!.resources.stone).toBe(2)
  })
})

describe('ae-negative-57-phase', () => {
  const { sessions, ok, save, make, finish, play, choose } = audit57Phase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('D163 N1 actual first occupation purchase gives exactly two stone and whole undo removes its reward before one replay', () => {
    const session = make('D163_JourneymanBricklayer', undefined, false), response = finish(session, play(session, 'D163_JourneymanBricklayer')), undone = ok(session.undoAction()), replay = finish(session, play(session, 'D163_JourneymanBricklayer'))
    assert.equal(response.state.players[0]!.resources.stone, 2); assert.equal(undone.state.players[0]!.resources.stone, 0); assert.ok(undone.state.players[0]!.occupationHand.includes('D163_JourneymanBricklayer')); assert.equal(replay.state.players[0]!.resources.stone, 2)
    save('D163-N1', { response, undone, replay })
  })
  it('D163 N2 actual opponent stone renovation or a batch of two stone rooms grants one owner stone for the action', () => {
    for (const mode of ['renovate', 'rooms']) {
      const session = make('D163_JourneymanBricklayer', state => { state.currentPlayerIndex = 1; state.players[1]!.houseType = mode === 'renovate' ? 'clay' : 'stone'; Object.assign(state.players[1]!.resources, { stone: mode === 'rooms' ? 10 : 2, reed: mode === 'rooms' ? 4 : 1 }) }, true, 14)
      let pending = ok(session.takeAction(1, mode === 'renovate' ? 'house-redevelopment' : 'farm-expansion'))
      if (mode === 'rooms') { if (pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice') pending = choose(session, pending, option => option.labelKey === 'actions.construct.name'); pending = ok(session.commitSelectionChoice(1, { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }] })) }
      const response = finish(session, pending)
      assert.equal(response.state.players[0]!.resources.stone, 1); assert.equal(response.state.players[1]!.houseType, 'stone'); assert.equal(response.state.players[1]!.rooms, mode === 'rooms' ? 4 : 2)
      save(`D163-N2-${mode}`, { pending, response })
    }
  })
  it('D163 N3 own stone renovation opponent clay renovation and card in hand do not grant additional owner stone', () => {
    for (const mode of ['self', 'clay', 'hand']) {
      const actor = mode === 'self' ? 0 : 1
      const session = make('D163_JourneymanBricklayer', state => { state.currentPlayerIndex = actor; state.players[actor]!.houseType = mode === 'clay' ? 'wood' : 'clay'; Object.assign(state.players[actor]!.resources, { clay: 2, stone: 2, reed: 1 }) }, mode !== 'hand', 14), response = finish(session, ok(session.takeAction(actor, 'house-redevelopment')))
      assert.equal(response.state.players[0]!.resources.stone, 0)
      assert.equal(response.state.players[actor]!.houseType, mode === 'clay' ? 'clay' : 'stone')
      save(`D163-N3-${mode}`, response)
    }
  })
})
