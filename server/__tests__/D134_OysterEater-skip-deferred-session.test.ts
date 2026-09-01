import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'

import '../../shared/cards/D/D134_OysterEater'
import type { SessionResponse } from '../../shared/session/session-core'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'

const drainPending = (session: GameSession, resp: SessionResponse) => {
  let safety = 25
  while (
    safety-- > 0 &&
    (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch' ||
      resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-next-player')
  ) {
    resp =
      resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch'
        ? confirmPlayerSwitch(session)
        : confirmNextPlayer(session)
  }
  return resp
}

/**
 * D134 OysterEater skip-next-placement, wired via the new
 * `onBeforePlayerTurn` hook (Task 0.3 / Sprint 7a). Setup mirrors the
 * pattern in D134_OysterEater-session.test.ts but verifies that owner's
 * next labor turn is auto-skipped after the flag is set.
 */
describe('D134_OysterEater skip-next-placement (onBeforePlayerTurn)', () => {
  it('owner skips their next labor turn when flag is set', () => {
    const session = new GameSession(134, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 3
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }

    const owner = state.players[0]!
    owner.occupationPlayed.push('D134_OysterEater')

    const fishingSpace = state.actionSpaces.find((s) => s.id === 'fishing')
    if (!fishingSpace) throw new Error('fishing space missing')
    fishingSpace.resources.food = 1

    session.loadState(state)

    // p1 (opponent) takes fishing → triggers the scope:any listener which
    // writes skipNextPlacement = 1 onto owner (p0).
    let resp = session.takeAction(3, 'fishing')
    expect(resp.ok).toBe(true)
    resp = drainPending(session, resp)

    // After advancing to p0, the new onBeforePlayerTurn hook should consume
    // the flag and skip p0's labor turn. With p1 already used a worker and
    // p0 skipped, currentPlayerIndex should bounce back to p1 (still has
    // the second worker available).
    expect(resp.state.currentPlayerIndex).toBe(1)
    expect(resp.state.players[0]!.cardStates?.D134_OysterEater?.extraData?.skipNextPlacement).toBeUndefined()
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.events).toContainEqual(expect.objectContaining({
      type: 'turn.skipped',
      playerId: owner.id,
      reason: 'cardEffect',
    }))
  })

  it('owner skips only once when flag is 1', () => {
    const session = new GameSession(134, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 3
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }

    const owner = state.players[0]!
    owner.occupationPlayed.push('D134_OysterEater')
    // Pre-seed flag = 1 directly so we can verify decrement.
    owner.cardStates ??= {}
    owner.cardStates.D134_OysterEater = {
      counters: {},
      extraData: { skipNextPlacement: 1 },
    }

    session.loadState(state)

    // p1 day-laborer → confirmNextPlayer → onBeforePlayerTurn fires for p0,
    // sees flag=1, decrements to 0, returns skipTurn → bounce back to p1.
    let resp = session.takeAction(3, 'day-laborer')
    expect(resp.ok).toBe(true)
    resp = drainPending(session, resp)

    expect(resp.state.currentPlayerIndex).toBe(1)
    expect(
      resp.state.players[0]!.cardStates?.D134_OysterEater?.extraData?.skipNextPlacement,
    ).toBeUndefined()
  })

  it('does not skip when flag is absent', () => {
    const session = new GameSession(134, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 3
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }

    const owner = state.players[0]!
    owner.occupationPlayed.push('D134_OysterEater')
    // No flag preset.

    session.loadState(state)

    let resp = session.takeAction(3, 'day-laborer')
    expect(resp.ok).toBe(true)
    resp = drainPending(session, resp)

    expect(resp.state.currentPlayerIndex).toBe(0)
  })

  it('D134 S4 carries an unused same-round skip into the next round', () => {
    const session = new GameSession(134, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 3
    state.round = 1
    state.roundPhase = 'work'
    for (const [index, player] of state.players.entries()) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      setActiveWorkerCount(player, index < 2 ? 2 : 1)
      if (index < 3) markAllWorkersUsed(state, player)
    }
    const owner = state.players[0]!
    owner.occupationPlayed.push('D134_OysterEater')
    const fishingSpace = state.actionSpaces.find((space) => space.id === 'fishing')
    if (!fishingSpace) throw new Error('fishing space missing')
    fishingSpace.resources.food = 1
    session.loadState(state)

    let response = session.takeAction(3, 'fishing')
    expect(response.ok).toBe(true)
    response = drainPending(session, response)

    expect(response.state.round).toBe(2)
    expect(response.state.currentPlayerIndex).toBe(0)
    expect(response.state.players[0]!.cardStates?.D134_OysterEater?.extraData?.skipNextPlacement)
      .toBe(1)
    response = session.takeAction(0, 'day-laborer')
    expect(response.ok).toBe(true)
    response = drainPending(session, response)
    expect(response.state.currentPlayerIndex).toBe(1)
    expect(response.state.players[0]!.cardStates?.D134_OysterEater?.extraData?.skipNextPlacement)
      .toBe(1)

    for (const [playerIndex, spaceId] of [[1, 'forest'], [2, 'clay-pit'], [3, 'reed-bank']] as const) {
      response = session.takeAction(playerIndex, spaceId)
      expect(response.ok).toBe(true)
      response = drainPending(session, response)
    }

    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'turn.skipped',
      playerId: owner.id,
      reason: 'cardEffect',
    }))
    expect(response.state.currentPlayerIndex).toBe(1)
    expect(response.state.players[0]!.cardStates?.D134_OysterEater?.extraData?.skipNextPlacement)
      .toBeUndefined()
  })
})
