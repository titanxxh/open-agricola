import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/D/D134_OysterEater'
import type { SessionResponse } from '../../shared/session/session-core'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/legacy-confirms'

const drainPending = (session: GameSession, resp: SessionResponse) => {
  let safety = 25
  while (
    safety-- > 0 &&
    (resp.pending.type === 'confirmPlayerSwitch' ||
      resp.pending.type === 'confirmNextPlayer')
  ) {
    resp =
      resp.pending.type === 'confirmPlayerSwitch'
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
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 1

    const owner = state.players[0]!
    owner.occupationPlayed.push('D134_OysterEater')

    const fishingSpace = state.actionSpaces.find((s) => s.id === 'fishing')
    if (!fishingSpace) throw new Error('fishing space missing')
    fishingSpace.resources.food = 1

    session.loadState(state)

    // p1 (opponent) takes fishing → triggers the scope:any listener which
    // writes skipNextPlacement = 1 onto owner (p0).
    let resp = session.takeAction(1, 'fishing')
    expect(resp.ok).toBe(true)
    resp = drainPending(session, resp)

    // After advancing to p0, the new onBeforePlayerTurn hook should consume
    // the flag and skip p0's labor turn. With p1 already used a worker and
    // p0 skipped, currentPlayerIndex should bounce back to p1 (still has
    // the second worker available).
    expect(resp.state.currentPlayerIndex).toBe(1)
    expect(resp.state.players[0]!.cardStates?.D134_OysterEater?.extraData?.skipNextPlacement).toBeUndefined()
  })

  it('owner skips only once when flag is 1', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 1

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
    let resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)
    resp = drainPending(session, resp)

    expect(resp.state.currentPlayerIndex).toBe(1)
    expect(
      resp.state.players[0]!.cardStates?.D134_OysterEater?.extraData?.skipNextPlacement,
    ).toBeUndefined()
  })

  it('does not skip when flag is absent', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 1

    const owner = state.players[0]!
    owner.occupationPlayed.push('D134_OysterEater')
    // No flag preset.

    session.loadState(state)

    let resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)
    resp = drainPending(session, resp)

    expect(resp.state.currentPlayerIndex).toBe(0)
  })
})
