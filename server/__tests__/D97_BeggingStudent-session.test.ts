import { type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/A/A114_SeasonalWorker'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/D/D097_BeggingStudent'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'D097_BeggingStudent'

describe('D097_BeggingStudent session', () => {
  it('onBuy gives 1 begging marker', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    const beggingBefore = player.resources.begging

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    // onBuy mutates player directly (returns void/undefined)
    effect!.onBuy!(state, player)
    expect(player.resources.begging).toBe(beggingBefore + 1)
  })

  it('onStartHarvest returns optional occupation with exactCost {} when player has occupations in hand', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.occupationHand = ['A114_SeasonalWorker']

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onStartHarvest!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
    const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children).toHaveLength(1)
    expect(children[0].actionId).toBe('occupation')
    expect(children[0].sourceCard).toBe(CARD_ID)
    expect(children[0].params).toEqual({ exactCost: {} })
  })

  it('onStartHarvest returns undefined when player has no occupations in hand', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.occupationHand = []

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onStartHarvest!(state, player)
    expect(flow).toBeUndefined()
  })

})

describe('D097 Begging Student parity', () => {
  const CARD_ID = 'D097_BeggingStudent'

  const TARGET = 'A114_SeasonalWorker'

  const FILLER = '__test_placeholder__'

  const setup = ({ played = true, occupationInHand = true, harvest = false } = {}) => {
    const session = new GameSession(6097, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 4
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setActiveWorkerCount(player, 2)
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played
      ? (occupationInHand ? [TARGET] : [FILLER])
      : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources.begging = played ? 1 : 0
    owner.startPlayer = true
    state.players[1]!.startPlayer = false
    if (harvest) state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const playOccupation = (session: GameSession) => {
    let response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction)).toBeDefined()
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const enterFreeOccupation = (session: GameSession, response: SessionResponse) => {
    response = resolveTriggerIfPresent(session, response, CARD_ID)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }

  it('D097 S1: playing Begging Student immediately takes one begging marker', () => {
    const response = playOccupation(setup({ played: false, occupationInHand: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.begging).toBe(1)
  })

  it('D097 S2: at harvest start an occupation can be played without paying its normal cost', () => {
    const session = setup({ harvest: true })
    let response = enterFreeOccupation(session, session.performRoundEnd())
    if (response.state.players[0]!.occupationHand.includes(TARGET)) {
      expect(response.interaction.stateId).toBe('wait')
      const target = options(response).find((option) => option.value === TARGET)
      expect(target, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, target!.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(TARGET)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 16, begging: 1 })
  })

  it('D097 S3: the harvest occupation may be declined', () => {
    const session = setup({ harvest: true })
    const pending = resolveTriggerIfPresent(session, session.performRoundEnd(), CARD_ID)
    expect(options(pending).some((option) => option.value === '__skip__')).toBe(true)

    const response = session.resolveChoice(pending.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationHand).toContain(TARGET)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 16, begging: 1 })
  })

  it('D097 S4: with no occupation in hand the harvest has no Begging Student offer', () => {
    const response = setup({ occupationInHand: false, harvest: true }).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.begging).toBe(1)
  })
})
