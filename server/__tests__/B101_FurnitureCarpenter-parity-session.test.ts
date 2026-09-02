import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B101_FurnitureCarpenter'

const CARD_ID = 'B101_FurnitureCarpenter'

const setup = ({ inHand = false, joineryOwner = 1 }: { inHand?: boolean; joineryOwner?: number | null } = {}) => {
  const session = new GameSession(101, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = inHand ? 14 : 4
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.resources.food = 20
  })
  const player = state.players[0]!
  player.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.occupationPlayed = inHand ? [] : [CARD_ID]
  if (joineryOwner !== null) state.players[joineryOwner]!.improvements.push('Major_Joinery')
  session.loadState(state)
  return session
}

const resolveTrigger = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'select-trigger') {
    return response
  }
  const option = response.interaction.request.options?.find((entry) => entry.sourceCard === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const finishRound = (session: GameSession) => {
  session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))
  return resolveTrigger(session, session.performRoundEnd())
}

describe('B101 Furniture Carpenter parity', () => {
  it('B101 S1: playing Furniture Carpenter through Lessons keeps the occupation in play', () => {
    const response = setup({ inHand: true, joineryOwner: null }).takeAction(0, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B101 S2: another player owning Joinery enables one harvest point for two food', () => {
    const session = setup()
    let response = finishRound(session)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(14)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
  })

  it('B101 S3: the harvest exchange can be declined', () => {
    const session = setup()
    const pending = finishRound(session)
    expect(pending.interaction.stateId).toBe('wait')

    const response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(16)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBeUndefined()
  })

  it('B101 S4: without any Joinery the harvest exchange is absent', () => {
    const response = finishRound(setup({ joineryOwner: null }))

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.resources.food).toBe(16)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBeUndefined()
  })
})
