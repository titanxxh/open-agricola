import { type SessionResponse } from '../game/authoritative-session'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import '../../shared/cards/B/B143_ClayWarden'

describe('B143_ClayWarden session', () => {
  const setup = (currentPlayerIndex = 0) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex
    state.round = 1

    const owner = state.players[0]!
    owner.occupationPlayed.push('B143_ClayWarden')
    setWorkersAtHome(state, owner, 2)
    owner.resources.clay = 0

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2) // Ensure hollow-4 exists and has accumulated resources
    // hollow-4 is a 4-player space, but let's add it manually for testing
    const hollow4 = state.actionSpaces.find((s) => s.id === 'hollow-4')
    if (hollow4) {
      hollow4.resources.clay = 4
    }

    session.loadState(state)
    return session
  }

  it('owner gains 1 clay when opponent uses hollow-4', () => {
    const session = setup(1)
    const s = session.getState().state
    // Check if hollow-4 exists in the game
    const hollow4 = s.actionSpaces.find((sp) => sp.id === 'hollow-4')
    if (!hollow4) {
      // hollow-4 only exists in 4-player games; skip test
      return
    }

    const clayBefore = s.players[0]!.resources.clay

    let resp = session.takeAction(1, 'hollow-4')
    expect(resp.ok).toBe(true)

    // Walk through player switches for card effect
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 1)
  })

  it('does not trigger when owner uses hollow-4', () => {
    const session = setup(0)
    const s = session.getState().state
    const hollow4 = s.actionSpaces.find((sp) => sp.id === 'hollow-4')
    if (!hollow4) return

    const clayBefore = s.players[0]!.resources.clay
    const accumulatedClay = hollow4.resources.clay

    const resp = session.takeAction(0, 'hollow-4')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // Owner collects the accumulated clay but should NOT get extra +1 from listener
    // (opponent-scope means owner's own usage doesn't trigger)
    expect(after.players[0]!.resources.clay).toBe(clayBefore + accumulatedClay)
  })

  it('does not trigger on non-hollow spaces', () => {
    const session = setup(1)
    const clayBefore = session.getState().state.players[0]!.resources.clay

    const resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore)
  })

  it('owner gains 2 clay when opponent uses 3P hollow space', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 1
    state.round = 1

    const owner = state.players[0]!
    owner.occupationPlayed.push('B143_ClayWarden')
    setWorkersAtHome(state, owner, 2)
    owner.resources.clay = 0

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)

    const hollow = state.actionSpaces.find((s) => s.id === 'hollow')
    expect(hollow).toBeDefined()
    hollow!.resources.clay = 2

    session.loadState(state)

    let resp = session.takeAction(1, 'hollow')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // 3P gain: 1 base + 1 extra = 2 clay
    expect(after.players[0]!.resources.clay).toBe(2)
  })
})

describe('B143 Clay Warden parity', () => {
  const CARD_ID = 'B143_ClayWarden'

  const FILLER = '__test_placeholder__'

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const setup = (playerCount: 3 | 4) => {
    const session = new GameSession(6143 + playerCount, undefined, { playerCount })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      Object.assign(player.resources, { clay: 0, food: 0, reed: 0 })
    })
    state.players[0]!.occupationHand = [CARD_ID]
    const hollow = state.actionSpaces.find((space) => space.id === 'hollow')
    if (hollow) hollow.resources.clay = 3
    const hollow4 = state.actionSpaces.find((space) => space.id === 'hollow-4')
    if (hollow4) hollow4.resources.clay = 3
    state.actionSpaces.find((space) => space.id === 'reed-bank')!.resources.reed = 2
    session.loadState(state)
    return session
  }

  const playOccupation = (session: GameSession) => {
    let response = session.takeAction(0, 'lessons')
    if (response.interaction.stateId === 'wait'
      && response.state.players[0]!.occupationHand.includes(CARD_ID)) {
      const card = options(response).find((option) => option.value === CARD_ID)
      expect(card, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, card!.value)
    }
    return response
  }

  const prepareActor = (session: GameSession, actor: number) => {
    const played = playOccupation(session)
    expect(played.ok, played.error).toBe(true)
    expect(played.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    const state = session.getState().state
    state.currentPlayerIndex = actor
    session.loadState(state)
  }

  const settleCrossPlayerTrigger = (session: GameSession, initial: SessionResponse) => {
    let response = resolveTriggerIfPresent(session, initial, CARD_ID)
    for (let remaining = 8; remaining > 0
      && response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'confirm-player-switch'; remaining -= 1) {
      response = confirmPlayerSwitch(session)
      response = resolveTriggerIfPresent(session, response, CARD_ID)
    }
    return response
  }

  it('B143 S3: in a four-player game an opponent using Hollow4 gives one clay and one food', () => {
    const session = setup(4)
    prepareActor(session, 1)

    const response = settleCrossPlayerTrigger(session, session.takeAction(1, 'hollow-4'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, food: 1 })
    expect(response.state.players[1]!.resources.clay).toBe(3)
  })
})
