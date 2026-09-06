import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { maxFences } from '../../shared/actions/effects/fencing'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/A/A022_Telegram'

const CARD_ID = 'A022_Telegram'
const FILLER = '__test_placeholder__'

const setupPurchase = ({ round = 1, fencesInSupply = 1 } = {}) => {
  const session = new GameSession(5022, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationHand = [FILLER]
  player.resources.food = 2
  player.supplyTokensConsumed = { fence: maxFences - fencesInSupply }
  const opponent = state.players[1]!
  setWorkersAtHome(state, opponent, 2)
  opponent.minorHand = [FILLER]
  opponent.occupationHand = [FILLER]
  state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy = []
  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'major-improvement')
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const play = (session: GameSession): SessionResponse => {
  const response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (!option) return response
  return session.resolveChoice(0, option.value)
}

const setupDue = ({ supplyFarmer = true } = {}) => {
  const session = new GameSession(6022, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.round = 1
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    if (!supplyFarmer && player === state.players[0]) setActiveWorkerCount(player, 5)
    markAllWorkersUsed(state, player)
  })
  const player = state.players[0]!
  player.minorPlayed = [CARD_ID]
  player.cardStates = { [CARD_ID]: { extraData: { triggerRound: 2 } } }
  session.loadState(state)
  return session
}

const acceptTelegram = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.sourceCard).toBe(CARD_ID)
  const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
  expect(accept).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, accept!.value)
}

describe('A022 Telegram parity', () => {
  it('A022 S1: one fence in supply schedules Telegram for the next round and costs two food', () => {
    const response = play(setupPurchase())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'triggerRound')).toBe(2)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A022 S2: no fence in supply keeps Telegram unavailable without payment', () => {
    const response = enterImprovementChoice(setupPurchase({ fencesInSupply: 0 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(2)
  })

  it('A022 S3: a target after round fourteen records no Telegram round', () => {
    const response = play(setupPurchase({ round: 14 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'triggerRound')).toBeUndefined()
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A022 S4: in the target round Telegram places on Forest without adding a supply person', () => {
    const session = setupDue()
    let response = acceptTelegram(session, session.performRoundEnd())
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.options?.map((option) => option.value)).toContain('forest')
    response = session.resolveChoice(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(2)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(2)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy)
      .toContainEqual(expect.objectContaining({ playerId: response.state.players[0]!.id }))
  })

  it('A022 S5: OA offers target-round Telegram even with no person in supply', () => {
    const response = setupDue({ supplyFarmer: false }).performRoundEnd()

    expect(response.state.round).toBe(2)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.sourceCard).toBe(CARD_ID)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(5)
  })
})
