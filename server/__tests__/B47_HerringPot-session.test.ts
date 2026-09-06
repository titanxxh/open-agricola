import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B047_HerringPot'

const CARD_ID = 'B047_HerringPot'
const FILLER = '__test_placeholder__'

const setup = ({ played = false, clay = 1, round = 5, actor = 0 } = {}) => {
  const session = new GameSession(5047, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.resources.clay = clay
  owner.resources.food = 0
  const fishing = state.actionSpaces.find((space) => space.id === 'fishing')
  if (!fishing) throw new Error('fishing missing')
  fishing.resources.food = 2
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playMinor = (session: GameSession): SessionResponse => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const futureRounds = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.playerId === response.state.players[0]!.id
    && entry.cardId === CARD_ID && (entry.resources.food ?? 0) > 0)
  .flatMap((entry) => Array.from({ length: entry.resources.food ?? 0 }, () => entry.round))
  .sort((left, right) => left - right)

describe('B047 Herring Pot parity', () => {
  it('B047 S1: paying one clay plays Herring Pot', () => {
    const response = playMinor(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('B047 S2: without clay Herring Pot remains unavailable', () => {
    const response = enterMinor(setup({ clay: 0 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect((response.interaction.request.options ?? []).some((option) => option.value === CARD_ID)).toBe(false)
    expect(futureRounds(response)).toEqual([])
  })

  it('B047 S3: using Fishing schedules one food on each of the next three rounds', () => {
    const response = setup({ played: true }).takeAction(0, 'fishing')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(futureRounds(response)).toEqual([6, 7, 8])
  })

  it('B047 S4: using a non-Fishing accumulation space schedules no food', () => {
    const session = setup({ played: true })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    session.loadState(state)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(futureRounds(response)).toEqual([])
  })

  it('B047 S5: another player using Fishing does not trigger the owner Herring Pot', () => {
    const response = setup({ played: true, actor: 1 }).takeAction(1, 'fishing')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.food).toBe(22)
    expect(futureRounds(response)).toEqual([])
  })

  it('B047 S6: a round-thirteen Fishing use schedules only reachable round-fourteen food', () => {
    const response = setup({ played: true, round: 13 }).takeAction(0, 'fishing')

    expect(response.ok, response.error).toBe(true)
    expect(futureRounds(response)).toEqual([14])
  })

  it('B047 S7: scheduled Herring Pot food is received at the next round start', () => {
    const session = setup({ played: true })
    session.takeAction(0, 'fishing')
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(futureRounds(response)).toEqual([7, 8])
  })
})
