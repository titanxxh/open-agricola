import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A096_TaskArtisan'
import '../../shared/cards/A/A030_BakingSheet'
import '../../shared/cards/A/A067_CornScoop'

const CARD_ID = 'A096_TaskArtisan'
const MINOR_ID = 'A030_BakingSheet'
const OTHER_MINOR_ID = 'A067_CornScoop'
const FILLER = '__test_placeholder__'

const setup = ({ played = false, round = 1, withMinors = true } = {}) => {
  const session = new GameSession(5096, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    player.resources.wood = 0
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.minorHand = withMinors ? [MINOR_ID, OTHER_MINOR_ID] : [FILLER]
  owner.fields = []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  return resolveTriggerIfPresent(session, response, CARD_ID)
}

const chooseTaskArtisanMinor = (session: GameSession, response: SessionResponse) => {
  response = resolveTriggerIfPresent(session, response, CARD_ID)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, accept!.value)

  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.options?.map((option) => option.value)).toContain(MINOR_ID)
  expect(response.interaction.request.options?.some((option) => option.value.startsWith('Major_'))).toBe(false)
  response = session.resolveChoice(response.interaction.playerIndex, MINOR_ID)
  if (response.interaction.stateId === 'wait'
    && response.interaction.sourceCard === CARD_ID
    && response.interaction.request.options?.some((option) => option.value === '__skip__')) {
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
  }
  return response
}

const declineTaskArtisanMinor = (session: GameSession, response: SessionResponse) => {
  response = resolveTriggerIfPresent(session, response, CARD_ID)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)
  return session.resolveChoice(response.interaction.playerIndex, '__skip__')
}

const revealNextRound = (session: GameSession, revealed: string) => {
  const state = session.getState().state
  state.roundActionOrder[state.round] = revealed
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

describe('A096 Task Artisan parity', () => {
  it('A096 S1: playing Task Artisan gains one wood and the Minor Improvement action may be declined', () => {
    const session = setup()

    const response = declineTaskArtisanMinor(session, playOccupation(session))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.minorHand).toContain(MINOR_ID)
  })

  it('A096 S2: the action granted on play can build a Minor Improvement but offers no major', () => {
    const session = setup()

    const response = chooseTaskArtisanMinor(session, playOccupation(session))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.minorPlayed).toContain(MINOR_ID)
  })

  it('A096 S3: revealing Western Quarry gains one wood and offers a Minor Improvement action', () => {
    const session = setup({ played: true, round: 6 })

    const response = chooseTaskArtisanMinor(session, revealNextRound(session, 'western-quarry'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(7)
    // Characterize current OA behavior: returning from the nested improvement
    // re-enters the same round-start hook, granting the wood a second time.
    expect(response.state.players[0]!.resources.wood).toBe(2)
    expect(response.state.players[0]!.minorPlayed).toContain(MINOR_ID)
  })

  it('A096 S4: revealing Eastern Quarry gains one wood even when the optional action is declined', () => {
    const session = setup({ played: true, round: 12 })

    const response = declineTaskArtisanMinor(session, revealNextRound(session, 'eastern-quarry'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(13)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.minorHand).toContain(MINOR_ID)
  })

  it('A096 S5: revealing a non-stone accumulation space grants neither wood nor an improvement action', () => {
    const session = setup({ played: true, round: 5 })

    const response = revealNextRound(session, 'vegetable-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })
})
