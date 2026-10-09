import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { B023_FinalScenario } from '../../shared/cards/B/B023_FinalScenario'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { setWorkersAtHome } from '../../shared/domain/player'

describe('B023_FinalScenario prerequisite', () => {
  it('blocks when round == 14', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.round = 14
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, B023_FinalScenario, state.round, state)).toBe(false)
  })

  it('allows when round <= 13', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.round = 13
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, B023_FinalScenario, state.round, state)).toBe(true)
  })

  it('sets exclusiveUse on the round 14 action space and gates non-owner placement', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 13
    const owner = state.players[0]!
    const other = state.players[1]!
    owner.resources.clay = owner.rooms + 5
    owner.resources.reed = 5
    owner.minorHand = ['B023_FinalScenario']
    session.loadState(state)

    session.devPlayCard(0, 'B023_FinalScenario')
    const afterBuy = session.getState().state
    const round14Id = afterBuy.roundActionOrder[13]!
    const space = afterBuy.actionSpaces.find((entry) => entry.id === round14Id)!

    expect(space.exclusiveUse).toEqual({
      playerId: owner.id,
      sourceCardId: 'B023_FinalScenario',
      untilRound: 14,
    })
    expect(session.getActionAvailability(0)[round14Id]).toBe(true)
    expect(session.getActionAvailability(1)[round14Id]).toBe(false)
    afterBuy.currentPlayerIndex = 1
    session.loadState(afterBuy)
    const blocked = session.takeAction(1, round14Id)
    expect(blocked.ok).toBe(false)
    expect(blocked.error).toBe('space unavailable')
    afterBuy.currentPlayerIndex = 0
    session.loadState(afterBuy)
    const ownerAction = session.takeAction(0, round14Id)
    expect(ownerAction.ok).toBe(true)
    expect(afterBuy.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'action.revealed',
        actionId: round14Id,
        roundSlot: 14,
        sourceCardId: 'B023_FinalScenario',
      }),
      expect.objectContaining({
        type: 'action.exclusiveUseSet',
        actionId: round14Id,
        playerId: owner.id,
        untilRound: 14,
      }),
    ]))
    expect(other.id).not.toBe(owner.id)
  })

  it('clears exclusiveUse at round 14 start and emits clear event', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 13
    state.players[0]!.minorHand = ['B023_FinalScenario']
    session.loadState(state)
    session.devPlayCard(0, 'B023_FinalScenario')
    const ready = session.getState().state
    ready.players.forEach((player) => setWorkersAtHome(ready, player, 0))
    session.loadState(ready)
    const resp = session.performRoundEnd()
    const round14Id = resp.state.roundActionOrder[13]!
    const space = resp.state.actionSpaces.find((entry) => entry.id === round14Id)!
    expect(space.exclusiveUse).toBeUndefined()
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'action.exclusiveUseCleared', actionId: round14Id }),
    ]))
    const revealEvents = resp.state.events.filter((event) =>
      event.type === 'action.revealed' &&
      event.actionId === round14Id &&
      event.roundSlot === 14)
    expect(revealEvents).toHaveLength(1)
  })
})
