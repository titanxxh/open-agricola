import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/A/A116_WoodCutter'

// A116_WoodCutter has a simple `after place-farmer` listener that fires once
// per wood-space visit. We use it as a representative card to assert that
// ActivateCardNode increments cardStates[id].extraData.resourceStats.used
// every time a listener fires (the engine-level cross-cutting concern).

describe('per-card used stat', () => {
  const setup = () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('A116_WoodCutter')
    setWorkersAtHome(state, player, 2)
    player.resources.wood = 0

    state.players[1]!.workersAvailable = 2
    state.players.slice(2).forEach((extraPlayer) => setWorkersAtHome(state, extraPlayer, 0))

    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 3
    const copse = state.actionSpaces.find((s) => s.id === 'copse')
    if (copse) copse.resources.wood = 2

    session.loadState(state)
    session.devPlayCard(0, 'A116_WoodCutter')
    return session
  }

  it('increments cardStates.used when A116 listener fires', () => {
    const session = setup()
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.wood).toBe(4) // listener actually fired
    const stats = readCardResourceStats(after.players[0]!, 'A116_WoodCutter')
    expect(stats?.used).toBe(1)
  })

  it('does not write used when listener does not fire (non-wood space)', () => {
    const session = setup()
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const stats = readCardResourceStats(session.getState().state.players[0]!, 'A116_WoodCutter')
    expect(stats?.used ?? 0).toBe(0)
  })
})
