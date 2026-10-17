import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/D/D168_Stockman'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit58Livestock from './_helpers/audit/ae-negative-58-livestock'

const CARD_ID = 'D168_Stockman'

describe('D168_Stockman session', () => {
  const runAfterStables = (configure: (player: import('../../shared/contract/types').PlayerState) => void) => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.stableTiles = []
    configure(player)
    const space = state.actionSpaces.find((s) => s.id === 'farm-expansion')!
    session.loadState(state)

    const listener = session.withCtx(() => getRegisteredCardListeners()).find(
      (reg) => reg.id === 'D168-stockman-after-stables',
    )!
    const context: CardListenerContext = {
      state,
      player,
      space,
      actionId: 'stables',
      phase: 'after',
      result: { type: 'ok' },
    }
    return session.withCtx(() => executeCardListener(listener, context))
  }

  it('counts the B85 FarmHand stable when locating the ordinal stable (card-facing count)', () => {
    // B85 already in use before this action; the snapshot baseline is the
    // card-facing count (0 ordinary + B85 = 1). Now 1 ordinary tile built
    // this action + B85 -> card-facing nAfter = 2, so the newly built tile
    // is the 2nd stable -> gains 1 cattle.
    const result = runAfterStables((player) => {
      player.stableTiles = [{ row: 2, col: 2 }]
      player.occupationPlayed.push('B085_FarmHand')
      player.cardStates = {
        __actionSnapshot__: { extraData: { stableTiles: 1 } },
        B085_FarmHand: { extraData: { position: { row: 0, col: 0 } } },
      }
    })
    expect(result).toBeDefined()
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).params?.cattle).toBe(1)
  })

  it('does not fire when the built stable is only the 1st card-facing stable', () => {
    const result = runAfterStables((player) => {
      player.stableTiles = [{ row: 2, col: 2 }]
      player.cardStates = {
        __actionSnapshot__: { extraData: { stableTiles: 0 } },
      }
    })
    expect(result).toBeUndefined()
  })
})

describe('ae-negative-58-livestock', () => {
  const { sessions, ok, save, make, finish, play, choose, count, buildStables } = audit58Livestock
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('D168 N1 building second third and fourth stables in one paid batch grants exactly cattle boar and sheep', () => {
    const session = make('D168_Stockman', state => { state.players[0]!.stableTiles = [{ row: 0, col: 1 }]; state.players[0]!.resources.wood = 6 })
    const response = buildStables(session, [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }])
    assert.deepEqual(count(response), [1, 1, 1])
    assert.equal(response.state.players[0]!.stableTiles.length, 4)
    assert.equal(response.state.players[0]!.resources.wood, 0)
    save('D168-N1', response)
  })
  it('D168 N2 first stable and card only in hand grant no animals while ordinary two wood stable fee is paid', () => {
    for (const [played, prior] of [[true, 0], [false, 1]] as const) {
      const session = make('D168_Stockman', state => { state.players[0]!.stableTiles = prior ? [{ row: 0, col: 1 }] : []; state.players[0]!.resources.wood = 2 }, played)
      const response = buildStables(session, [{ row: 0, col: 2 }])
      assert.deepEqual(count(response), [0, 0, 0])
      assert.equal(response.state.players[0]!.stableTiles.length, prior + 1)
      assert.equal(response.state.players[0]!.resources.wood, 0)
      save(`D168-N2-${played}`, response)
    }
  })
  it('D168 N3 actual occupation purchase with four preexisting stables grants no retroactive animals', () => {
    const session = make('D168_Stockman', state => { state.players[0]!.stableTiles = [1, 2, 3, 4].map(col => ({ row: 0, col })) }, false)
    const response = finish(session, play(session, 'D168_Stockman'))
    assert.deepEqual(count(response), [0, 0, 0])
    assert.equal(response.state.players[0]!.stableTiles.length, 4)
    save('D168-N3', response)
  })
  it('D168 N4 occupied stable target rejects before legal second stable and whole undo removes cattle and restores wood', () => {
    const session = make('D168_Stockman', state => { state.players[0]!.stableTiles = [{ row: 0, col: 1 }]; state.players[0]!.resources.wood = 2 })
    let pending = ok(session.takeAction(0, 'farm-expansion'))
    if (pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice') pending = choose(session, pending, option => option.labelKey === 'actions.stables.name')
    const rejected = assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }))
    const response = finish(session, ok(session.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })))
    const undone = ok(session.undoAction())
    assert.deepEqual(count(response), [0, 0, 1])
    assert.deepEqual(count(undone), [0, 0, 0])
    assert.equal(undone.state.players[0]!.resources.wood, 2)
    assert.equal(undone.state.players[0]!.stableTiles.length, 1)
    save('D168-N4', { pending, rejected, response, undone })
  })
})
