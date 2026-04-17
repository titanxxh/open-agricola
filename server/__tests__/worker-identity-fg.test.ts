import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getRoundPlacementOrder } from '../../shared/cards/helpers/round-placement'

describe('worker-identity: family growth pushes newborn to FG space takenBy', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    // Round 2+ so wish-children is available
    state.round = 2

    const player = state.players[0]!
    // 2 initial active workers (ids '1', '2'), worker '3' is inactive
    // rooms=3 > familySize=2 so growth is allowed
    player.familySize = 2
    player.workersAvailable = 2
    player.rooms = 3

    session.loadState(state)
    return session
  }

  it('family growth: activates worker 3 as newborn, pushes WorkerRef to wish-children space', () => {
    const session = setup()
    const resp = session.takeAction(0, 'wish-children')
    expect(resp.ok).toBe(true)

    const state = resp.state
    const p1 = state.players[0]!

    // familySize legacy field incremented
    expect(p1.familySize).toBe(3)
    // newbornCount legacy field incremented
    expect(p1.newbornCount).toBe(1)

    // Worker '3' should now be active and marked as newborn
    const worker3 = p1.workers.find((w) => w.id === '3')
    expect(worker3).toBeDefined()
    expect(worker3!.isActive).toBe(true)
    expect(worker3!.isNewborn).toBe(true)

    // Workers '1' and '2' remain active non-newborns
    const worker1 = p1.workers.find((w) => w.id === '1')
    const worker2 = p1.workers.find((w) => w.id === '2')
    expect(worker1!.isActive).toBe(true)
    expect(worker1!.isNewborn).toBe(false)
    expect(worker2!.isActive).toBe(true)
    expect(worker2!.isNewborn).toBe(false)

    // wish-children space should have 2 WorkerRefs: parent (worker '1') + newborn ('3')
    const fgSpace = state.actionSpaces.find((s) => s.id === 'wish-children')
    expect(fgSpace).toBeDefined()
    expect(fgSpace!.takenBy).toHaveLength(2)

    const p1Refs = fgSpace!.takenBy.filter((r) => r.playerId === p1.id)
    expect(p1Refs).toHaveLength(2)

    const workerIds = p1Refs.map((r) => r.workerId).sort()
    // One ref for the placed parent (smallest active at home = '1'),
    // one ref for the newborn ('3')
    expect(workerIds).toContain('1')
    expect(workerIds).toContain('3')

    // __roundPlacement__ should have exactly ONE entry (the parent's placement).
    // The newborn should NOT be recorded as a placement.
    const placements = getRoundPlacementOrder(p1)
    expect(placements).toHaveLength(1)
    expect(placements[0]).toBe('wish-children')
  })

  it('family growth blocked when rooms <= familySize: familySize unchanged, no newborn activated', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // Make rooms equal to familySize so growth is blocked
    player.rooms = 2
    player.familySize = 2
    session.loadState(state)

    // takeAction still returns ok:true (soft fail — the action fails but the call succeeds),
    // but the family growth effect should not apply.
    const resp = session.takeAction(0, 'wish-children')
    expect(resp.ok).toBe(true)

    const p1 = resp.state.players[0]!
    // familySize stays at 2 — growth was blocked
    expect(p1.familySize).toBe(2)
    expect(p1.newbornCount).toBe(0)
    // Worker '3' stays inactive
    const worker3 = p1.workers.find((w) => w.id === '3')
    expect(worker3!.isActive).toBe(false)
    expect(worker3!.isNewborn).toBe(false)
  })

  it('urgent-wish-children: grows family without room check, newborn joins space', () => {
    const session = setup()
    const state = session.getState().state
    state.round = 5
    const player = state.players[0]!
    // Rooms equal to familySize — no room for normal growth
    player.rooms = 2
    player.familySize = 2
    player.workersAvailable = 2
    session.loadState(state)

    const resp = session.takeAction(0, 'urgent-wish-children')
    expect(resp.ok).toBe(true)

    const p1 = resp.state.players[0]!
    // Family grew even without spare room
    expect(p1.familySize).toBe(3)
    expect(p1.newbornCount).toBe(1)

    const worker3 = p1.workers.find((w) => w.id === '3')
    expect(worker3!.isActive).toBe(true)
    expect(worker3!.isNewborn).toBe(true)

    const fgSpace = resp.state.actionSpaces.find((s) => s.id === 'urgent-wish-children')
    expect(fgSpace).toBeDefined()
    expect(fgSpace!.takenBy).toHaveLength(2)

    const p1Refs = fgSpace!.takenBy.filter((r) => r.playerId === p1.id)
    expect(p1Refs).toHaveLength(2)
    const workerIds = p1Refs.map((r) => r.workerId).sort()
    expect(workerIds).toContain('1')
    expect(workerIds).toContain('3')

    // Only one round placement (the parent) — newborn is NOT recorded
    const placements = getRoundPlacementOrder(p1)
    expect(placements).toHaveLength(1)
    expect(placements[0]).toBe('urgent-wish-children')
  })
})
