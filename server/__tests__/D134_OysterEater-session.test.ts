import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D134_OysterEater'
import type { SessionResponse } from '../../shared/session/session-core'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'

describe('D134_OysterEater session', () => {
  const setup = (currentPlayerIndex: number) => {
    const session = new GameSession(134, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = currentPlayerIndex
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
    return session
  }

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

  it('D134 S1 grants one bonus VP to the owner when an opponent fishes', () => {
    const session = setup(1)

    let resp = session.takeAction(1, 'fishing')
    expect(resp.ok).toBe(true)
    resp = drainPending(session, resp)

    const after = session.getState().state
    expect(after.players[0]!.cardStates?.D134_OysterEater?.counters?.bonusVp).toBe(1)
  })

  it('D134 S2 grants one bonus VP to the owner when the owner fishes', () => {
    const session = setup(0)

    let resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)
    resp = drainPending(session, resp)

    const after = session.getState().state
    expect(after.players[0]!.cardStates?.D134_OysterEater?.counters?.bonusVp).toBe(1)
  })

  it('records a skipNextPlacement flag after fishing trigger (before owner turn)', () => {
    const session = setup(1)

    const resp = session.takeAction(1, 'fishing')
    expect(resp.ok).toBe(true)
    // The flag is written by the increment-extra-data SE in the listener
    // chain, which runs before the engine yields control. Inspect state
    // immediately, without confirming the next-player transition (which
    // would consume the flag via onBeforePlayerTurn — see
    // D134_OysterEater-skip-deferred-session.test.ts).
    const after = session.getState().state
    const extra = after.players[0]!.cardStates?.D134_OysterEater?.extraData
    expect(extra?.skipNextPlacement).toBe(1)
  })

  it('D134 S3 does not trigger on non-Fishing actions', () => {
    const session = setup(1)

    let resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)
    resp = drainPending(session, resp)

    const after = session.getState().state
    const counter = after.players[0]!.cardStates?.D134_OysterEater?.counters?.bonusVp
    expect(counter ?? 0).toBe(0)
  })
})
