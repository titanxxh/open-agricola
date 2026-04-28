import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { setWorkersAtHome } from '../../shared/game/player'

import '../../shared/cards/A/A116_WoodCutter'

describe('gained.occupation pseudo-stat', () => {
  it('does NOT write gained.occupation to the directly-played occupation card', () => {
    // Standard player-driven `lessons` action -> playOccupation has no sourceCard,
    // so the played occupation should not accumulate gained.occupation on itself.
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('A116_WoodCutter')
    setWorkersAtHome(state, player, 2)
    player.resources.food = 5

    state.players[1]!.workersAvailable = 2
    state.players.slice(2).forEach((extraPlayer) => setWorkersAtHome(state, extraPlayer, 0))

    session.loadState(state)
    // Drive `play-occupation` via lessons action with the chosen card
    const lessonsResp = session.takeAction(0, 'lessons')
    expect(lessonsResp.ok).toBe(true)

    // Resolve the choice -> play A116
    const pending = session.getState().pending
    if (pending.type === 'choice') {
      session.resolveChoice(0, 'A116_WoodCutter')
    }

    const stats = readCardResourceStats(session.getState().state.players[0]!, 'A116_WoodCutter')
    expect(stats?.gained?.occupation ?? 0).toBe(0)
  })
})
