import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/B/B162_ForestClearer'

const CARD_ID = 'B162_ForestClearer'

describe('B162_ForestClearer session', () => {
  const setup = (woodOnForest: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    player.resources.wood = 0
    player.resources.food = 0

    // Set up forest with specific wood amount
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = woodOnForest

    session.loadState(state)
    session.devPlayCard(0, CARD_ID)
    return session
  }

  it('gains +1 wood +1 food when collecting exactly 2 wood', () => {
    const session = setup(2)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // 2 wood from space + 1 bonus wood = 3
    expect(player.resources.wood).toBe(2 + 1)
    // 1 bonus food
    expect(player.resources.food).toBe(1)
  })

  it('gains +1 wood (no food) when collecting exactly 3 wood', () => {
    const session = setup(3)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // 3 wood from space + 1 bonus wood = 4
    expect(player.resources.wood).toBe(3 + 1)
    // No bonus food for 3 wood
    expect(player.resources.food).toBe(0)
  })

  it('gains +1 wood +1 food when collecting exactly 4 wood', () => {
    const session = setup(4)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // 4 wood from space + 1 bonus wood = 5
    expect(player.resources.wood).toBe(4 + 1)
    // 1 bonus food for 4 wood
    expect(player.resources.food).toBe(1)
  })

  it('does not trigger when collecting 1 wood', () => {
    const session = setup(1)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(1)
    expect(player.resources.food).toBe(0)
  })

  it('does not trigger when collecting 5+ wood', () => {
    const session = setup(5)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(5)
    expect(player.resources.food).toBe(0)
  })

  it('does not trigger on non-wood spaces', () => {
    const session = setup(3)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(0)
  })
})
