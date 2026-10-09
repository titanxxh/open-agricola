import { type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { B033_Mantlepiece } from '../../shared/cards/B/B033_Mantlepiece'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { setWorkersAtHome } from '../../shared/domain/player'

const CARD_ID = 'B033_Mantlepiece'

describe('B033_Mantlepiece prerequisite', () => {
  it('blocks when player still lives in a wooden house', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'wood'
    expect(meetsCardPrerequisites(player, B033_Mantlepiece, state.round, state)).toBe(false)
  })

  it('allows when player lives in a clay house', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'clay'
    expect(meetsCardPrerequisites(player, B033_Mantlepiece, state.round, state)).toBe(true)
  })

  it('allows when player lives in a stone house', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'stone'
    expect(meetsCardPrerequisites(player, B033_Mantlepiece, state.round, state)).toBe(true)
  })

  it('rejects renovation before placing a worker once Mantlepiece is played', () => {
    const session = new GameSession(33, undefined, { playerCount: 2 })
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    const player = state.players[0]!
    player.houseType = 'clay'
    player.minorPlayed = [CARD_ID]
    player.resources.stone = player.rooms
    player.resources.reed = 1
    setWorkersAtHome(state, player, 2)
    const redevelopment = state.actionSpaces.find((space) => space.id === 'house-redevelopment')
    if (!redevelopment) throw new Error('house-redevelopment missing')
    redevelopment.takenBy = []
    session.loadState(state)

    const response = session.takeAction(0, 'house-redevelopment')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources).toMatchObject({ stone: player.rooms, reed: 1 })
    expect(response.state.actionSpaces.find((space) => space.id === 'house-redevelopment')?.takenBy).toEqual([])
  })

  it('rejects Farm Redevelopment before placing a worker once Mantlepiece is played', () => {
    const session = new GameSession(33, undefined, { playerCount: 2 })
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    const player = state.players[0]!
    player.houseType = 'clay'
    player.minorPlayed = [CARD_ID]
    player.resources.stone = player.rooms
    player.resources.reed = 1
    player.resources.wood = 20
    setWorkersAtHome(state, player, 2)
    const redevelopment = state.actionSpaces.find((space) => space.id === 'farm-redevelopment')
    if (!redevelopment) throw new Error('farm-redevelopment missing')
    redevelopment.takenBy = []
    session.loadState(state)

    const response = session.takeAction(0, 'farm-redevelopment')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.actionSpaces.find((space) => space.id === 'farm-redevelopment')?.takenBy).toEqual([])
  })
})

describe('B033 Mantlepiece parity', () => {
  const CARD_ID = 'B033_Mantlepiece'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = false, houseType = 'clay', round = 10, stone = played ? 0 : 1,
  }: {
    played?: boolean
    houseType?: 'wood' | 'clay' | 'stone'
    round?: number
    stone?: number
  } = {}) => {
    const session = new GameSession(6033 + round, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources = {
        ...player.resources,
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.houseType = houseType
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.resources.stone = stone
    owner.resources.reed = played ? 1 : 0
    for (const id of ['meeting-place', 'house-redevelopment', 'farm-redevelopment']) {
      const space = state.actionSpaces.find((candidate) => candidate.id === id)
      if (space) space.takenBy = []
    }
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    return response
  }

  const playMinor = (session: GameSession) => {
    let response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    if (response.interaction.stateId === 'wait') {
      const card = options(response).find((option) => option.value === CARD_ID)
      if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    }
    return response
  }

  const score = (response: SessionResponse) => ({
    printed: response.scores[0]!.categories.find((category) => category.key === 'cards')
      ?.entries.find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score ?? 0,
    bonus: response.scores[0]!.categories.find((category) => category.key === 'cardBonusVp')
      ?.entries.find((entry) => 'cardId' in entry && entry.cardId === CARD_ID)?.score ?? 0,
  })

  it('B033 S1: in round ten a clay house pays one stone and gains four bonus points', () => {
    const response = playMinor(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(0)
    expect(score(response)).toEqual({ printed: -3, bonus: 4 })
  })

  it('B033 S4: in round fourteen Mantlepiece grants no bonus points', () => {
    const response = playMinor(setup({ round: 14 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(score(response)).toEqual({ printed: -3, bonus: 0 })
  })
})
