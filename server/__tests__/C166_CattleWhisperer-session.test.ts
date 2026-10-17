import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import * as audit57Phase from './_helpers/audit/ae-negative-57-phase'

describe('ae-negative-57-phase', () => {
  const { sessions, ok, save, make, finish, transition, play, counts } = audit57Phase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('C166 N1 actual purchases in rounds one six nine and ten schedule only future five and eight offsets within round fourteen', () => {
    for (const [round, due] of [[1, [6, 9]], [6, [11, 14]], [9, [14]], [10, []]] as const) {
      const session = make('C166_CattleWhisperer', undefined, false, round), response = finish(session, play(session, 'C166_CattleWhisperer'))
      const deliveries = response.state.futureMeeples.filter(entry => entry.cardId === 'C166_CattleWhisperer')
      assert.deepEqual(deliveries.map(entry => entry.round), due); assert.ok(deliveries.every(entry => entry.resources.cattle === 1)); assert.deepEqual(counts(response), [0, 0, 0])
      save(`C166-N1-${round}`, response)
    }
  })
  it('C166 N2 real round one purchase then natural round six and nine preparations deliver exactly one cattle each without early delivery', () => {
    const session = make('C166_CattleWhisperer', state => { state.players[0]!.stableTiles = [{ row: 0, col: 1 }, { row: 0, col: 2 }] }, false, 1), played = finish(session, play(session, 'C166_CattleWhisperer'))
    let response = played
    for (let target = 2; target <= 9; target++) {
      response = transition(session, target)
      const cattle = target < 6 ? 0 : target < 9 ? 1 : 2
      assert.equal(response.state.players[0]!.resources.cattle, cattle)
      assert.deepEqual(response.state.players.slice(1).map(player => player.resources.cattle), [0, 0, 0])
      save(`C166-N2-${target}`, response)
    }
    assert.equal(response.state.futureMeeples.some(entry => entry.cardId === 'C166_CattleWhisperer'), false)
  })
  it('C166 N3 whole occupation purchase undo removes both future deliveries and replay queues them once', () => {
    const session = make('C166_CattleWhisperer', undefined, false, 6), response = finish(session, play(session, 'C166_CattleWhisperer')), undone = ok(session.undoAction()), replay = finish(session, play(session, 'C166_CattleWhisperer'))
    assert.equal(undone.state.futureMeeples.some(entry => entry.cardId === 'C166_CattleWhisperer'), false); assert.ok(undone.state.players[0]!.occupationHand.includes('C166_CattleWhisperer')); assert.deepEqual(replay.state.futureMeeples.filter(entry => entry.cardId === 'C166_CattleWhisperer').map(entry => entry.round), [11, 14])
    save('C166-N3', { response, undone, replay })
  })
})
