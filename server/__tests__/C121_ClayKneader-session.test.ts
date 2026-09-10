import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/C/C121_ClayKneader'
import type { ActionFlow } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

const CARD_ID = 'C121_ClayKneader'

describe('C121_ClayKneader session', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)
    return session
  }

  it('onBuy grants 1 wood and 2 clay', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ wood: 1, clay: 2 })
  })

  it('gains 1 clay when using grain-seeds', () => {
    const session = setup()
    const state = session.getState().state
    const clayBefore = state.players[0]!.resources.clay

    let resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)

    // Walk through any pending player switches
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // +1 clay from ClayKneader
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 1)
    // +1 grain from the action space
    expect(after.players[0]!.resources.grain).toBeGreaterThanOrEqual(1)
  })

  it('gains 1 clay when using vegetable-seeds', () => {
    const session = setup()
    const state = session.getState().state
    // vegetable-seeds requires round 3+
    state.round = 3
    session.loadState(state)

    const clayBefore = session.getState().state.players[0]!.resources.clay

    let resp = session.takeAction(0, 'vegetable-seeds')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 1)
  })

  it('does not trigger on non-matching action spaces', () => {
    const session = setup()
    const clayBefore = session.getState().state.players[0]!.resources.clay

    let resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // No clay gained from ClayKneader
    expect(after.players[0]!.resources.clay).toBe(clayBefore)
  })
})

describe('C121 Clay Kneader parity', () => {
  const CARD_ID = 'C121_ClayKneader'

  const FILLER = '__test_placeholder__'

  const setup = ({ played = true, actor = 0 } = {}) => {
    const session = new GameSession(6121, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = actor
    state.round = 6
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    session.loadState(state)
    return session
  }

  const playOccupation = (session: GameSession) => {
    const response = session.takeAction(0, 'lessons')
    if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction)).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, card!.value)
  }

  it('C121 S1: playing Clay Kneader immediately grants one wood and two clay', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 2 })
  })

  it('C121 S5: an opponent using Grain Seeds gives the owner no clay', () => {
    const response = setup({ actor: 1 }).takeAction(1, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.players[1]!.resources).toMatchObject({ grain: 1, clay: 0 })
  })
})
