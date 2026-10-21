import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/B/B144_Collier'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

// B144_Collier has a simple space-use `after` listener that fires once per
// Clay Pit visit. We use it as a representative card to assert that
// Internal listener activation increments cardStates[id].extraData.resourceStats.used
// every time a listener fires (the engine-level cross-cutting concern).

describe('per-card used stat', () => {
  const setup = () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('B144_Collier')
    setWorkersAtHome(state, player, 2)
    player.resources.wood = 0
    player.resources.reed = 0

    state.players[1]!.workersAvailable = 2
    state.players.slice(2).forEach((extraPlayer) => setWorkersAtHome(state, extraPlayer, 0))

    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (clayPit) clayPit.resources.clay = 2

    session.loadState(state)
    session.devPlayCard(0, 'B144_Collier')
    return session
  }

  it('increments cardStates.used when B144 listener fires', () => {
    const session = setup()
    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources).toMatchObject({ clay: 2, wood: 1, reed: 1 }) // listener actually fired
    const stats = readCardResourceStats(after.players[0]!, 'B144_Collier')
    expect(stats?.used).toBe(1)
  })

  it('does not write used when listener does not fire (other space)', () => {
    const session = setup()
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const stats = readCardResourceStats(session.getState().state.players[0]!, 'B144_Collier')
    expect(stats?.used ?? 0).toBe(0)
  })
})
