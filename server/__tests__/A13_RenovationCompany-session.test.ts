import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A013_RenovationCompany } from '../../shared/cards/A/A013_RenovationCompany'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('A013_RenovationCompany prerequisite', () => {
  it('blocks when house is not wooden or rooms != 2', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'clay'
    expect(meetsCardPrerequisites(player, A013_RenovationCompany, state.round, state)).toBe(false)
  })

  it('allows when in wooden house with exactly 2 rooms', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'wood'
    player.rooms = 2
    expect(meetsCardPrerequisites(player, A013_RenovationCompany, state.round, state)).toBe(true)
  })
})

describe('A013 Renovation Company parity', () => {
  const CARD_ID = 'A013_RenovationCompany'

  const FILLER = '__test_placeholder__'

  const setup = ({
    houseType = 'wood', rooms = 2, wood = 4,
  }: {
    houseType?: 'wood' | 'clay' | 'stone'
    rooms?: number
    wood?: number
  } = {}) => {
    const session = new GameSession(6013, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      }
    })
    const player = state.players[0]!
    player.minorHand = [CARD_ID, FILLER]
    player.houseType = houseType
    player.rooms = rooms
    player.resources.wood = wood
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId !== 'wait') return response
    if (options(response).some((option) => option.value === CARD_ID)) return response
    const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    return response
  }

  const playCard = (session: GameSession) => {
    let response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const acceptFreeRenovation = (session: GameSession, response: SessionResponse) => {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
    if (response.interaction.stateId === 'wait'
      && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      response = session.resolveChoice(response.interaction.playerIndex, 'clay')
    }
    return response
  }

  it('A013 S1: paying four wood gains three clay and accepting the free renovation keeps that clay', () => {
    const session = setup()
    const response = acceptFreeRenovation(session, playCard(session))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      resources: { wood: 0, clay: 3, reed: 0 },
    })
  })

  it('A013 S2: declining the free renovation still gains three clay', () => {
    const session = setup()
    let response = playCard(session)
    expect(options(response).map((option) => option.value)).toContain('__skip__')
    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'wood',
      resources: { wood: 0, clay: 3 },
    })
  })

  it('A013 S3: a non-wooden two-room house keeps Renovation Company unavailable', () => {
    const response = enterMinor(setup({ houseType: 'clay' }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(4)
  })

  it('A013 S4: a three-room wooden house keeps Renovation Company unavailable', () => {
    const response = enterMinor(setup({ rooms: 3 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(4)
  })
})
