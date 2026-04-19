import { describe, it, expect } from 'vitest'
import { GameSession } from '../game-session'
import { computeAllowedPlacementSpaces } from '../../shared/actions/effects/placement-availability'
import { setWorkersAtHome, setActiveWorkerCount } from '../../shared/game/player'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import '../../shared/cards/C/C129_SecondSpouse'

describe('placement consistency: takeAction vs computeAllowedPlacementSpaces', () => {
  it('urgent-wish-children appears in allowed set when C129 is active', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 3 })
    const st = session.getState().state
    st.currentPlayerIndex = 0
    st.round = 5

    // Open urgent-wish-children at round 1
    st.roundActionOrder = st.roundActionOrder.map((id) =>
      id === 'urgent-wish-children' ? null : id,
    )
    st.roundActionOrder[0] = 'urgent-wish-children'

    const p0 = st.players[0]!
    const p1 = st.players[1]!
    setWorkersAtHome(st, p0, 2)
    setActiveWorkerCount(p0, 2)
    p0.rooms = 3

    // p0 holds C129
    p0.occupationPlayed.push('C129_SecondSpouse')

    // p1 occupies urgent-wish-children (first placement this round)
    const urgent = st.actionSpaces.find((s) => s.id === 'urgent-wish-children')!
    urgent.takenBy.push({ playerId: p1.id, workerId: 'b1' })
    recordRoundPlacement(p1, 'urgent-wish-children', 'b1')

    session.loadState(st)

    // Check helper
    const { state } = session.getState()
    const allowed = computeAllowedPlacementSpaces(state, state.players[0]!)
    const entry = allowed.find((a) => a.spaceId === 'urgent-wish-children')
    expect(entry).toBeDefined()
    expect(entry!.allowOccupied).toBe(true)

    // Check takeAction succeeds
    const resp = session.takeAction(0, 'urgent-wish-children')
    expect(resp.ok).toBe(true)
  })

  it('urgent-wish-children is blocked without C129', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 3 })
    const st = session.getState().state
    st.currentPlayerIndex = 0
    st.round = 5

    st.roundActionOrder = st.roundActionOrder.map((id) =>
      id === 'urgent-wish-children' ? null : id,
    )
    st.roundActionOrder[0] = 'urgent-wish-children'

    const p0 = st.players[0]!
    const p1 = st.players[1]!
    setWorkersAtHome(st, p0, 2)
    setActiveWorkerCount(p0, 2)
    p0.rooms = 3

    // p1 occupies urgent-wish-children — NO C129
    const urgent = st.actionSpaces.find((s) => s.id === 'urgent-wish-children')!
    urgent.takenBy.push({ playerId: p1.id, workerId: 'b1' })
    recordRoundPlacement(p1, 'urgent-wish-children', 'b1')

    session.loadState(st)

    const { state } = session.getState()
    const allowed = computeAllowedPlacementSpaces(state, state.players[0]!)
    expect(allowed.some((a) => a.spaceId === 'urgent-wish-children')).toBe(false)

    const resp = session.takeAction(0, 'urgent-wish-children')
    expect(resp.ok).toBe(false)
  })
})
