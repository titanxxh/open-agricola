import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D158_BeanCounter'

const CARD_ID = 'D158_BeanCounter'

describe('D158 Bean Counter session', () => {
  it('resets two stored food and gains three after using actual round-action slot 8', () => {
    const session = new GameSession(1)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 8

    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.cardStates = { [CARD_ID]: { counters: { food: 2 } } }
    player.resources.food = 1
    setWorkersAtHome(state, player, 2)

    const actionId = 'western-quarry'
    const previousSlot8 = state.roundActionOrder[7]
    const quarrySlot = state.roundActionOrder.indexOf(actionId)
    expect(quarrySlot).toBeGreaterThanOrEqual(0)
    state.roundActionOrder[quarrySlot] = previousSlot8
    state.roundActionOrder[7] = actionId
    session.loadState(state)

    const beforeLogLength = session.state.log.length
    const beforeScores = session.getState().scores
    const resp = session.takeAction(0, actionId)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]).toMatchObject({
      resources: { food: 4 },
      cardStates: { [CARD_ID]: { counters: { food: 0 } } },
    })
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-next-player')
    expect(resp.state.log.length).toBeGreaterThan(beforeLogLength)
    expect(resp.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'log.cardEffectGain',
        params: expect.objectContaining({ cardId: CARD_ID, gain: { food: 3 } }),
      }),
      expect.objectContaining({
        key: 'log.placeFarmer',
        params: expect.objectContaining({ action: 'actions.western-quarry.name' }),
      }),
    ]))
    expect(resp.scores).toEqual(beforeScores)
  })
})
