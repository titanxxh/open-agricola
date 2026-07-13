import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A042_ForestLakeHut'

const CARD_ID = 'A042_ForestLakeHut'

describe('A042_ForestLakeHut session', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const owner = state.players[0]!
    owner.minorPlayed.push(CARD_ID)

    // Stock the relevant spaces with some resources.
    const fishing = state.actionSpaces.find((s) => s.id === 'fishing')
    if (!fishing) throw new Error('fishing space missing')
    fishing.resources.food = 2

    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (!forest) throw new Error('forest space missing')
    forest.resources.wood = 3

    session.loadState(state)
    return session
  }

  it('grants 1 WOOD after using the Fishing space', () => {
    const session = setup()
    const state = session.getState().state
    const woodBefore = state.players[0]!.resources.wood ?? 0
    const foodBefore = state.players[0]!.resources.food ?? 0

    const resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Fishing normal gain is 2 food; card adds +1 wood.
    expect(p.resources.wood).toBe(woodBefore + 1)
    expect(p.resources.food).toBe(foodBefore + 2)
  })

  it('grants 1 FOOD after using the Forest space', () => {
    const session = setup()
    const state = session.getState().state
    const foodBefore = state.players[0]!.resources.food ?? 0
    const woodBefore = state.players[0]!.resources.wood ?? 0

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Forest normal gain is 3 wood; card adds +1 food.
    expect(p.resources.wood).toBe(woodBefore + 3)
    expect(p.resources.food).toBe(foodBefore + 1)
  })

  it('does not trigger on other spaces (e.g. day-laborer)', () => {
    const session = setup()
    const state = session.getState().state
    const woodBefore = state.players[0]!.resources.wood ?? 0

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // day-laborer gives food but the Forest Lake Hut must NOT add wood.
    expect(p.resources.wood).toBe(woodBefore)
  })

  it('does not trigger when card is not in play', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    // Card NOT played.
    const fishing = state.actionSpaces.find((s) => s.id === 'fishing')
    if (!fishing) throw new Error('fishing space missing')
    fishing.resources.food = 2

    session.loadState(state)
    const woodBefore = state.players[0]!.resources.wood ?? 0

    const resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)
    const p = resp.state.players[0]!
    expect(p.resources.wood).toBe(woodBefore)
  })
})
