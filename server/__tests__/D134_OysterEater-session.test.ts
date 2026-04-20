import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/D/D134_OysterEater'

describe('D134_OysterEater session', () => {
  const setup = (currentPlayerIndex: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex

    const owner = state.players[0]!
    owner.occupationPlayed.push('D134_OysterEater')

    const fishingSpace = state.actionSpaces.find((s) => s.id === 'fishing')
    if (!fishingSpace) throw new Error('fishing space missing')
    fishingSpace.resources.food = 1

    session.loadState(state)
    return session
  }

  const drainPending = (session: GameSession, resp: any) => {
    let safety = 25
    while (
      safety-- > 0 &&
      (resp.pending.type === 'confirmPlayerSwitch' ||
        resp.pending.type === 'confirmNextPlayer')
    ) {
      resp =
        resp.pending.type === 'confirmPlayerSwitch'
          ? session.confirmPlayerSwitch()
          : session.confirmNextPlayer()
    }
    return resp
  }

  it('grants 1 bonus VP to owner when opponent fishes', () => {
    const session = setup(1)

    let resp = session.takeAction(1, 'fishing')
    expect(resp.ok).toBe(true)
    resp = drainPending(session, resp)

    const after = session.getState().state
    expect(after.players[0]!.cardStates?.D134_OysterEater?.counters?.bonusVp).toBe(1)
  })

  it('grants 1 bonus VP to owner when owner fishes (scope: any)', () => {
    const session = setup(0)

    let resp = session.takeAction(0, 'fishing')
    expect(resp.ok).toBe(true)
    resp = drainPending(session, resp)

    const after = session.getState().state
    expect(after.players[0]!.cardStates?.D134_OysterEater?.counters?.bonusVp).toBe(1)
  })

  it('records a skipNextPlacement flag after fishing trigger', () => {
    const session = setup(1)

    let resp = session.takeAction(1, 'fishing')
    expect(resp.ok).toBe(true)
    resp = drainPending(session, resp)

    const after = session.getState().state
    const extra = after.players[0]!.cardStates?.D134_OysterEater?.extraData
    expect(extra?.skipNextPlacement).toBe(1)
  })

  it('does not trigger on non-fishing actions', () => {
    const session = setup(1)

    let resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)
    resp = drainPending(session, resp)

    const after = session.getState().state
    const counter = after.players[0]!.cardStates?.D134_OysterEater?.counters?.bonusVp
    expect(counter ?? 0).toBe(0)
  })
})
