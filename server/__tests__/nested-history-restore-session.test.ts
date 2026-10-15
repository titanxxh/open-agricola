import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import '../../shared/cards/register-all'

const TROWEL = 'D013_Trowel'
const ANYTIME = 'D13-trowel-anytime'
const sessions = new Set<GameSession>()
afterEach(() => {
  sessions.forEach(session => session.dispose())
  sessions.clear()
})

const ok = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  return response
}
const wait = (response: SessionResponse) => {
  ok(response)
  assert.equal(response.interaction.stateId, 'wait')
  return response.interaction
}
const restore = (session: GameSession) => {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
  sessions.add(restored)
  return restored
}
const setup = () => {
  const session = createWorkSession({ seed: 1198, configure(state) {
    state.round = 5
    const player = state.players[0]!
    player.minorPlayed = [TROWEL]
    player.houseType = 'clay'
    Object.assign(player.resources, { stone: 2, reed: 0, food: 5, sheep: 0 })
    const market = state.actionSpaces.find(space => space.id === 'sheep-market')
    assert.ok(market)
    market.resources.sheep = 1
  } })
  sessions.add(session)
  return session
}

describe('nested engine history restoration', () => {
  it.each([false, true])('undoAction cancels the placement and nested renovation with restore=%s', restored => {
    let session = setup()
    const parent = ok(session.takeAction(0, 'sheep-market'))
    expect(wait(parent).request.kind).toBe('animal-reorg')
    const nested = ok(session.takeAnytimeAction(0, ANYTIME))
    expect(wait(nested).request.kind).toBe('animal-reorg')
    expect(nested.state.players[0]).toMatchObject({ houseType: 'stone', resources: { stone: 0, sheep: 1 } })
    if (restored) session = restore(session)
    const undone = ok(session.undoAction())
    expect(undone.interaction.stateId).toBe('idle')
    expect(undone.state.players[0]).toMatchObject({ houseType: 'clay', resources: { stone: 2, sheep: 0 } })
    expect(undone.state.actionSpaces.find(space => space.id === 'sheep-market')).toMatchObject({ resources: { sheep: 1 }, takenBy: [] })
    expect(undone.state.events.filter(event => event.type === 'farm.renovated')).toHaveLength(0)
    expect(undone.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'renovation')).toHaveLength(0)
    ok(session.takeAction(0, 'sheep-market'))
    const redone = ok(session.takeAnytimeAction(0, ANYTIME))
    const animals = wait(redone)
    assert.equal(animals.request.kind, 'animal-reorg')
    const complete = ok(session.resolveChoice(0, 'confirm', { zones: animals.request.zones }))
    expect(wait(complete).request.kind).toBe('confirm-next-player')
    expect(complete.state.players[0]).toMatchObject({ houseType: 'stone', resources: { stone: 0, sheep: 1 } })
    expect(complete.state.events.filter(event => event.type === 'farm.renovated')).toHaveLength(1)
    expect(complete.state.log.filter(entry => entry.key === 'log.actionDetail'
      && entry.params?.action === 'actions.sheep-market.name')).toHaveLength(1)
  })
})
