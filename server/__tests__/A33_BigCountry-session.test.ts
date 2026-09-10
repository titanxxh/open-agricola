import { type SessionResponse } from '../game/authoritative-session'
import { positionKey } from '../../shared/domain/farm'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A033_BigCountry } from '../../shared/cards/A/A033_BigCountry'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { getAllTilePositions } from '../../shared/domain/farm'

describe('A033_BigCountry prerequisite', () => {
  it('blocks when there is at least one free farmyard space', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, A033_BigCountry, state.round, state)).toBe(false)
  })

  it('allows when all 15 farmyard spaces are used', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    // Cover the 15 spaces by stuffing them as roomTiles for the prereq check.
    player.roomTiles = getAllTilePositions()
    player.fields = []
    player.stableTiles = []
    player.pastures = []
    expect(meetsCardPrerequisites(player, A033_BigCountry, state.round, state)).toBe(true)
  })
})

describe('A033 Big Country parity', () => {
  const CARD_ID = 'A033_BigCountry'

  const FILLER = '__test_placeholder__'

  const setup = ({ round = 10, unused = 0 } = {}) => {
    const session = new GameSession(6033, undefined, { playerCount: 2 })
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
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      }
    })
    const player = state.players[0]!
    player.minorHand = [CARD_ID, FILLER]
    const occupied = new Set(player.roomTiles.map(positionKey))
    player.fields = getAllTilePositions()
      .filter((position) => !occupied.has(positionKey(position)))
      .slice(0, 13 - unused)
      .map((position) => ({ ...position, stacks: [] }))
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
    expect(card).toBeDefined()
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  it('A033 S1: filling all farmyard spaces in round ten allows Big Country and gains four bonus points and eight food', () => {
    const response = playCard(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(8)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(4)
  })

  it('A033 S2: one unused farmyard space keeps Big Country unavailable', () => {
    const response = enterMinor(setup({ unused: 1 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A033 S3: in round fourteen Big Country can be played but gains no food or bonus points', () => {
    const response = playCard(setup({ round: 14 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })
})
