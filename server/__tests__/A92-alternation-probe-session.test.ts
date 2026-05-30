import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome, workersAvailable, newbornCount } from '../../shared/domain/player'
import { removeWorkerRef } from '../../shared/domain/space'
import { nextSeatedPlayerIdx } from '../../shared/session/phases/round'
import '../../shared/cards/A/A92_AdoptiveParents'

const A92 = 'A92_AdoptiveParents'

const placeholderHands = (state: { players: { minorHand: string[]; occupationHand: string[] }[] }) => {
  for (const p of state.players) {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
  }
}

describe('A92 alternation probe (session)', () => {
  // Probe A: a newborn occupying an action space is NOT available; running the
  // two mutations promote-first-newborn performs (clear isNewborn + remove from
  // all spaces) turns it into an available worker. Foundation for grow-only →
  // natural-alternation.
  it('probe A: promoting a space-occupying newborn makes it an available worker', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'

    const p0 = state.players[0]!
    setActiveWorkerCount(p0, 2)
    setWorkersAtHome(state, p0, 0)
    const active = p0.workers.filter((w) => w.isActive).sort((a, b) => Number(a.id) - Number(b.id))
    active[0]!.isNewborn = true
    placeholderHands(state)
    session.loadState(state)

    const loaded = session.getState().state
    const lp0 = loaded.players[0]!
    expect(workersAvailable(loaded, lp0)).toBe(0)
    expect(newbornCount(lp0)).toBe(1)

    const lnb = lp0.workers.find((w) => w.isActive && w.isNewborn)!
    lnb.isNewborn = false
    for (const s of loaded.actionSpaces) removeWorkerRef(s, lp0.id, lnb.id)

    expect(workersAvailable(loaded, lp0)).toBe(1)
    expect(newbornCount(lp0)).toBe(0)
  })

  // Probe B: a player out of ordinary workers but still holding A92 + a parked
  // newborn is invisible to the rotation. `nextSeatedPlayerIdx` only considers
  // players with `workersAvailable > 0`, so P0 is skipped and never handed a
  // turn — there is no window in which A92's offspring could be activated.
  // Proves capability B (a turn-rotation hook contributing an option for such a
  // player) is required.
  it('probe B: the rotation skips a player whose only worker is a parked newborn (with A92)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1
    state.roundPhase = 'work'

    const p0 = state.players[0]!
    const p1 = state.players[1]!

    // P0: two active workers, all used up (parked off-home → workersAvailable
    // 0), one of them a newborn. P0 still holds A92, so under BGA the offspring
    // would earn an extra turn — but OA's rotation cannot see it.
    setActiveWorkerCount(p0, 2)
    setWorkersAtHome(state, p0, 0)
    p0.workers.filter((w) => w.isActive)[0]!.isNewborn = true
    p0.occupationPlayed.push(A92)

    // P1: two active workers, one still available.
    setActiveWorkerCount(p1, 2)
    setWorkersAtHome(state, p1, 1)

    placeholderHands(state)
    session.loadState(state)

    const loaded = session.getState().state
    const lp0 = loaded.players[0]!

    // P0 genuinely holds an offspring + A92 that SHOULD earn a turn under BGA.
    expect(workersAvailable(loaded, lp0)).toBe(0)
    expect(newbornCount(lp0)).toBe(1)
    expect(lp0.occupationPlayed).toContain(A92)

    // Rotation starting from P1 skips P0 (no ordinary worker) and wraps to P1.
    const fromP1 = nextSeatedPlayerIdx(loaded, loaded.players, 1)
    expect(fromP1).toBe(1)
    // Even asking directly "who is next after P0" returns P1, never P0 itself.
    const fromP0 = nextSeatedPlayerIdx(loaded, loaded.players, 0)
    expect(fromP0).toBe(1)
  })
})
