import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getStoredResource, setStoredResource } from '../../shared/cards/helpers/card-storage'
import { setActiveWorkerCount } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E052_Cubbyhole'

describe('E052 Cubbyhole through Session', () => {
  it('pays the stored amount from supply in repeated harvests without consuming card food', () => {
    const session = new GameSession(7052, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const owner = session.state.players[0]!
    session.state.round = 4
    session.state.players.forEach((player) => {
      setActiveWorkerCount(player, 0)
      player.resources.food = 0
    })
    owner.minorPlayed = ['E052_Cubbyhole']
    setStoredResource(owner, 'E052_Cubbyhole', 'food', 3)
    session.loadState(session.state)

    const first = session.performRoundEnd()
    expect(first.ok, first.error).toBe(true)
    expect(first.state.players[0]!.resources.food).toBe(3)
    expect(getStoredResource(first.state.players[0]!, 'E052_Cubbyhole', 'food')).toBe(3)

    session.state.round = 7
    session.state.roundPhase = 'work'
    session.state.players.forEach((player) => {
      setActiveWorkerCount(player, 0)
      player.resources.food = 0
    })
    session.loadState(session.state)
    const snapshot = serializeSessionSnapshot(session.state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    const second = restored.performRoundEnd()
    expect(second.ok, second.error).toBe(true)
    expect(second.state.players[0]!.resources.food).toBe(3)
    expect(getStoredResource(second.state.players[0]!, 'E052_Cubbyhole', 'food')).toBe(3)
  })
})
