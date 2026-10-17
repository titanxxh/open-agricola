import assert from 'node:assert/strict'
import { afterEach, it, describe } from 'vitest'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit57Resources from './_helpers/audit/ae-negative-57-resources'

describe('ae-negative-57-resources', () => {
  const { sessions, ok, save, make, finish, play, ready, buildings } = audit57Resources
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('C162 N1 actual Lessons creates Forest Owner space then live opponent use grants three wood and one supply wood to owner', () => {
    const session = make('C162_ForestOwner', undefined, false)
    const played = finish(session, play(session, 'C162_ForestOwner'))
    assert.ok(played.state.actionSpaces.some(space => space.id === 'C162_ForestOwner'))
    assert.equal(ready(session).state.currentPlayerIndex, 1)
    const used = session.takeAction(1, 'C162_ForestOwner')
    save('C162-N1', { played, used })
    assert.deepEqual({ ok: used.ok, ownerWood: used.state.players[0]!.resources.wood, actorWood: used.state.players[1]!.resources.wood }, { ok: true, ownerWood: 1, actorWood: 3 })
  })
  it('C162 N2 loaded played card allows owner four wood and public opponent three plus owner one with occupied reuse rejected', () => {
    for (const actor of [0, 1]) {
      const session = make('C162_ForestOwner', state => { state.currentPlayerIndex = actor })
      const response = finish(session, ok(session.takeAction(actor, 'C162_ForestOwner')))
      assert.equal(response.state.players[0]!.resources.wood, actor === 0 ? 4 : 1)
      assert.equal(response.state.players[actor]!.resources.wood, actor === 0 ? 4 : 3)
      ready(session)
      const rejected = assertRejectedUnchanged(session, () => session.takeAction(session.state.currentPlayerIndex, 'C162_ForestOwner'))
      save(`C162-N2-${actor}`, { response, rejected })
    }
  })
  it('C162 N3 card only in hand provides no action space and legal unrelated grain collection gives no wood', () => {
    const session = make('C162_ForestOwner', undefined, false)
    assert.equal(session.getState().state.actionSpaces.some(space => space.id === 'C162_ForestOwner'), false)
    const rejected = assertRejectedUnchanged(session, () => session.takeAction(0, 'C162_ForestOwner'))
    const response = finish(session, ok(session.takeAction(0, 'grain-seeds')))
    assert.equal(response.state.players[0]!.resources.grain, 1)
    assert.deepEqual(buildings(response), { wood: 0, clay: 0, reed: 0, stone: 0 })
    save('C162-N3', { rejected, response })
  })
})
