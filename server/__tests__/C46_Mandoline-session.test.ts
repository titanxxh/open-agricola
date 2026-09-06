import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { GameState } from '../../shared/contract/types'

import '../../shared/cards/C/C046_Mandoline'

const CARD_ID = 'C046_Mandoline'
const ANYTIME_ID = 'C46-mandoline-anytime'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, wood = 1, vegetable = 2, food = 20, round = 5,
} = {}) => {
  const session = new GameSession(5046, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.startPlayer = true
  state.players[1]!.startPlayer = false
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources.wood = wood
  player.resources.vegetable = vegetable
  player.resources.food = food
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((candidate) => candidate.value === CARD_ID) ?? false)

const enterActiveInteraction = (session: GameSession, playerIndex = 0) => {
  const response = session.takeAction(playerIndex, 'farmland')
  expect(response.ok, response.error).toBe(true)
  return response
}

const anytimeOffered = (response: SessionResponse) =>
  response.interaction.anytimeActions.some((action) => action.id === ANYTIME_ID)

const useMandoline = (session: GameSession) => {
  const active = enterActiveInteraction(session)
  expect(anytimeOffered(active)).toBe(true)
  const response = session.takeAnytimeAction(0, ANYTIME_ID)
  expect(response.ok, response.error).toBe(true)
  return response
}

const futureRounds = (state: GameState) => state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID && (entry.resources.food ?? 0) > 0)
  .flatMap((entry) => Array.from({ length: entry.resources.food ?? 0 }, () => entry.round))
  .sort((left, right) => left - right)

const completeFarmland = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
  let completed = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
  expect(completed.ok, completed.error).toBe(true)
  if (completed.interaction.stateId === 'wait'
    && completed.interaction.request.kind === 'confirm-next-player') {
    completed = session.resolveChoice(completed.interaction.request.nextPlayerIndex, 'confirm')
    expect(completed.ok, completed.error).toBe(true)
  }
  return completed
}

describe('C046 Mandoline parity', () => {
  it('C046 S1: paying one wood plays Mandoline', () => {
    const response = play(setup({ played: false, vegetable: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('C046 S2: lacking wood keeps Mandoline unavailable', () => {
    const response = enterMinor(setup({ played: false, wood: 0, vegetable: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('C046 S3: paying one vegetable grants one bonus point and schedules food for the next two rounds', () => {
    const response = useMandoline(setup())
    const player = response.state.players[0]!

    expect(player.resources.vegetable).toBe(1)
    expect(player.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(futureRounds(response.state)).toEqual([6, 7])
    expect(isCardFlagged(player, CARD_ID)).toBe(true)
  })

  it('C046 S4: Mandoline cannot be used a second time in the same round', () => {
    const session = setup()
    const response = useMandoline(session)

    expect(anytimeOffered(response)).toBe(false)
    expect(session.takeAnytimeAction(0, ANYTIME_ID).ok).toBe(false)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(futureRounds(response.state)).toEqual([6, 7])
  })

  it('C046 S5: Mandoline is unavailable without a vegetable', () => {
    const session = setup({ vegetable: 0 })
    const response = enterActiveInteraction(session)

    expect(anytimeOffered(response)).toBe(false)
    expect(session.takeAnytimeAction(0, ANYTIME_ID).ok).toBe(false)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
    expect(futureRounds(response.state)).toEqual([])
  })

  it('C046 S6: a round-thirteen use schedules only the reachable round-fourteen food', () => {
    const response = useMandoline(setup({ round: 13 }))

    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(futureRounds(response.state)).toEqual([14])
  })

  it('C046 S7: next-round food is received and Mandoline becomes usable again', () => {
    const session = setup()
    const used = useMandoline(session)
    const foodBefore = used.state.players[0]!.resources.food
    completeFarmland(session, used)
    session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))

    const nextRound = session.performRoundEnd()

    expect(nextRound.ok, nextRound.error).toBe(true)
    expect(nextRound.state.round).toBe(6)
    expect(nextRound.state.players[0]!.resources.food).toBe(foodBefore + 1)
    expect(futureRounds(nextRound.state)).toEqual([7])
    expect(isCardFlagged(nextRound.state.players[0]!, CARD_ID)).toBe(false)
    expect(anytimeOffered(enterActiveInteraction(session))).toBe(true)
  })
})
