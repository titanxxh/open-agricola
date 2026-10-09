import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { familySize, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B010_Caravan'
import '../../shared/cards/register-all'

const CARD_ID = 'B010_Caravan'

describe('B010_Caravan — provides room for 1 person via computeExtraRoomCapacity', () => {
  it('exposes computeExtraRoomCapacity on the effect', () => {
    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    expect(effect!.computeExtraRoomCapacity).toBeDefined()
  })

  it('returns 1 when the card is in player.minorPlayed', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect!.computeExtraRoomCapacity!(player)).toBe(1)
  })

  it('returns 0 when the card is not played', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect!.computeExtraRoomCapacity!(player)).toBe(0)
  })
})

const FIXED_HANDS = [
  { occupation: 'A116_WoodCutter', minor: 'A004_Baseboards' },
  { occupation: 'B116_Shoreforester', minor: 'B003_Moonshine' },
]

const setupSession = (played: boolean) => {
  const session = new GameSession(10, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
    player.occupationHand = [FIXED_HANDS[index]!.occupation]
    player.minorHand = [FIXED_HANDS[index]!.minor]
    player.resources.food = 10
  })
  const player = state.players[0]!
  player.resources.wood = 3
  player.resources.food = 3
  if (played) player.minorPlayed = [CARD_ID]
  else player.minorHand = [CARD_ID]
  session.loadState(state)
  return session
}

const playCaravan = (session: GameSession) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId !== 'wait') return resp
  const improvementOption = resp.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
  if (improvementOption) resp = session.resolveChoice(0, improvementOption.value)
  if (resp.state.players[0]!.minorPlayed.includes(CARD_ID)) return resp
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const cardOption = resp.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(cardOption).toBeDefined()
  return session.resolveChoice(0, cardOption!.value)
}

describe('B010 parity batch-02 characterization', () => {
  it('B010 S1: Caravan is played for three wood and three food', () => {
    const resp = playCaravan(setupSession(false))

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('B010 S2: Caravan enables room-required family growth with two rooms and two people', () => {
    const blocked = setupSession(false)
    const blockedState = blocked.getState().state
    blockedState.players[0]!.minorHand = [FIXED_HANDS[0]!.minor]
    blocked.loadState(blockedState)
    expect(blocked.getActionAvailability(0)['wish-children']).toBe(false)
    const blockedResp = blocked.takeAction(0, 'wish-children')
    expect(blockedResp.ok).toBe(false)
    expect(blockedResp.error).toBe('space unavailable')
    expect(familySize(blockedResp.state.players[0]!)).toBe(2)

    const resp = setupSession(true).takeAction(0, 'wish-children')
    expect(resp.ok).toBe(true)
    expect(familySize(resp.state.players[0]!)).toBe(3)
    expect(resp.state.players[0]!.workers.some((worker) => worker.isActive && worker.isNewborn)).toBe(true)
  })

  it('B010 S3: the third person returns home and remains usable next round', () => {
    const session = setupSession(true)
    const growth = session.takeAction(0, 'wish-children')
    expect(growth.ok).toBe(true)

    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    const nextRound = session.performRoundEnd()

    expect(nextRound.ok).toBe(true)
    expect(familySize(nextRound.state.players[0]!)).toBe(3)
    expect(workersAvailable(nextRound.state, nextRound.state.players[0]!)).toBe(3)
    const forest = session.takeAction(0, 'forest')
    expect(forest.ok).toBe(true)
    expect(workersAvailable(forest.state, forest.state.players[0]!)).toBe(2)
  })
})
