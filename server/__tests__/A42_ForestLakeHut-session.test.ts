import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/A/A042_ForestLakeHut'

const CARD_ID = 'A042_ForestLakeHut'
const FILLER = '__test_placeholder__'

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

  const setupPurchase = () => {
    const session = new GameSession(5042, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorHand = [CARD_ID]
    player.occupationHand = [FILLER]
    player.resources.clay = 2
    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    opponent.minorHand = [FILLER]
    opponent.occupationHand = [FILLER]
    session.loadState(state)
    return session
  }

  it('A042 S1: paying two clay plays Forest Lake Hut', () => {
    const session = setupPurchase()
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId === 'wait') {
      const enter = response.interaction.request.options?.find((option) =>
        option.value.startsWith('action-improvement-'))
      if (enter) response = session.resolveChoice(0, enter.value)
    }
    if (response.interaction.stateId === 'wait') {
      const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
      expect(card).toBeDefined()
      response = session.resolveChoice(0, card!.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('A042 S2: using Fishing grants its food and one additional wood', () => {
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

  it('A042 S3: using Forest grants its wood and one additional food', () => {
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

  it('A042 S4: using another action grants no Forest Lake Hut bonus', () => {
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
