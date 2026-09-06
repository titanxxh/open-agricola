import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setNewbornCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C110_HomeBrewer'

const CARD_ID = 'C110_HomeBrewer'
const FILLER = '__test_placeholder__'

const setup = ({ played = true, grain = 1, fieldGrain = 0 } = {}) => {
  const session = new GameSession(5110, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = played ? 4 : 1
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0,
      food: index === 0 ? 20 : 20, grain: index === 0 ? grain : 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setNewbornCount(player, 0)
    if (played) {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 2)
    } else {
      setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID, FILLER]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (fieldGrain > 0) {
    owner.fields = [{
      row: 0, col: 0, stacks: [{ kind: 'grain', remaining: fieldGrain }],
    }]
  }
  session.loadState(state)
  return session
}

const playHomeBrewer = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  }
  return response
}

const resolveHomeBrewer = (
  session: GameSession, response: SessionResponse, outcome: 'food' | 'vp' | 'decline',
) => {
  for (let remaining = 4; remaining > 0 && response.interaction.stateId === 'wait'; remaining -= 1) {
    const options = response.interaction.request.options ?? []
    const desired = outcome === 'decline'
      ? options.find((option) => option.value === '__skip__')
      : outcome === 'food'
        ? options.find((option) => option.effectPreview?.resourcesGained?.food === 3)
        : options.find((option) => option.effectPreview?.bonusVp === 1)
    const trigger = options.find((option) => option.value === CARD_ID)
    const choice = desired ?? trigger
    expect(choice, JSON.stringify(response.interaction)).toBeDefined()
    if (!choice) return response
    response = session.resolveChoice(response.interaction.playerIndex, choice.value)
    if (desired) return response
  }
  return response
}

const cardOffered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.sourceCard === CARD_ID
    || response.interaction.request.options?.some((option) => option.sourceCard === CARD_ID
      || option.value === CARD_ID) === true)

describe('C110 Home Brewer parity', () => {
  it('C110 S1: Home Brewer can be played as the first occupation for no food', () => {
    const session = setup({ played: false, grain: 0 })
    session.state.players[0]!.resources.food = 0
    session.loadState(session.state)

    const response = playHomeBrewer(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('C110 S2: after the field phase exactly one grain may become three food', () => {
    const session = setup()

    const response = resolveHomeBrewer(session, session.performRoundEnd(), 'food')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 19 })
    expect(response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('C110 S3: after the field phase exactly one grain may become one bonus point', () => {
    const session = setup()

    const response = resolveHomeBrewer(session, session.performRoundEnd(), 'vp')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 16 })
    expect(response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBe(1)
  })

  it('C110 S4: the harvest exchange may be declined', () => {
    const session = setup()

    const response = resolveHomeBrewer(session, session.performRoundEnd(), 'decline')

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 16 })
    expect(response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('C110 S5: without grain the harvest offers no Home Brewer exchange', () => {
    const response = setup({ grain: 0 }).performRoundEnd()

    expect(cardOffered(response)).toBe(false)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('C110 S6: grain reaped in this field phase can immediately become three food', () => {
    const session = setup({ grain: 0, fieldGrain: 1 })

    const response = resolveHomeBrewer(session, session.performRoundEnd(), 'food')

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 19 })
  })

  it('C110 S7: one activation spends only one of two grain', () => {
    const session = setup({ grain: 2 })

    const response = resolveHomeBrewer(session, session.performRoundEnd(), 'food')

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 19 })
  })
})
