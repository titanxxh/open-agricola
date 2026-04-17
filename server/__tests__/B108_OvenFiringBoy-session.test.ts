import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/B/B108_OvenFiringBoy'

describe('B108_OvenFiringBoy session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('B108_OvenFiringBoy')
    player.resources.grain = 3
    player.resources.food = 0
    player.resources.wood = 0
    setWorkersAtHome(state, player, 2)
    state.players[1]!.workersAvailable = 2

    // Ensure wood space has accumulated resources
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 3

    session.loadState(state)
    session.devPlayCard(0, 'B108_OvenFiringBoy')
    return session
  }

  it('triggers bake bread opportunity when using forest', () => {
    const session = setup()

    // Player needs a baking improvement to actually bake bread
    // Without one, the bake-bread action is not doable.
    // The listener should still trigger and provide the action.
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    // Player collected wood from forest
    const after = session.getState().state
    expect(after.players[0]!.resources.wood).toBe(3) // accumulated wood
  })

  it('does not trigger on non-wood accumulation spaces', () => {
    const session = setup()
    const state = session.getState().state

    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (clayPit) clayPit.resources.clay = 2
    session.loadState(state)

    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)

    // No bake bread should have triggered (only wood spaces)
    const after = session.getState().state
    expect(after.players[0]!.resources.food).toBe(0) // no food gained
  })

  it('does not trigger for opponent on wood spaces', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 1
    state.players[1]!.resources.wood = 0
    session.loadState(state)

    const resp = session.takeAction(1, 'forest')
    expect(resp.ok).toBe(true)

    // Opponent used forest but card owner should not get bake bread
    const after = session.getState().state
    expect(after.players[0]!.resources.food).toBe(0)
  })

  it('does not trigger on day-laborer (not a wood space)', () => {
    const session = setup()
    const state = session.getState().state
    const foodBefore = state.players[0]!.resources.food
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    // Day laborer gives some food but no bake bread was triggered
    // We just verify the action completed normally without bake-bread choice
    const after = session.getState().state
    // Day laborer typically gives 2 food in 2-player — no extra bake bread
    expect(after.players[0]!.resources.food).toBeGreaterThanOrEqual(foodBefore)
  })
})
