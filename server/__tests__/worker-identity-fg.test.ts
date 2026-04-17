import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getRoundPlacementOrder } from '../../shared/cards/helpers/round-placement'

import '../../shared/cards/A/A92_AdoptiveParents'

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

describe('worker-identity: A92 AdoptiveParents removes newborn from FG space takenBy', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2

    const player = state.players[0]!
    // 2 initial active workers (ids '1', '2'), worker '3' is inactive
    // rooms=3 > familySize=2 so growth is allowed
    player.familySize = 2
    player.workersAvailable = 2
    player.rooms = 3
    player.resources.food = 5 // enough to pay A92's 1 food cost

    // Mark A92 as played
    player.occupationPlayed.push('A92_AdoptiveParents')
    player.playedCards.push('occupation:A92_AdoptiveParents')

    session.loadState(state)
    return session
  }

  it('A92 accepts: removes newborn WorkerRef from FG space, flips isNewborn=false, syncs legacy fields', () => {
    const session = setup()

    // Step 1: do Family Growth — wish-children places parent worker '1' + newborn '3' on space,
    //         then offers optional minor-improvement (wish-children's own tail).
    const fgResp = session.takeAction(0, 'wish-children')
    expect(fgResp.ok).toBe(true)
    // FG space already has 2 refs before we resolve anything
    expect(fgResp.state.actionSpaces.find((s) => s.id === 'wish-children')!.takenBy).toHaveLength(2)
    expect(fgResp.state.players[0]!.newbornCount).toBe(1)

    // Step 2: skip the optional minor-improvement offered by wish-children flow.
    //         After skip, A92's after-place-farmer hook fires and offers its optional seq.
    expect(fgResp.pending.type).toBe('choice')
    if (fgResp.pending.type !== 'choice') return
    const a92Resp = session.resolveChoice(0, '__skip__')
    expect(a92Resp.ok).toBe(true)

    // Step 3: accept the A92 optional offer (pay 1 food to grow child as adult + extra placement).
    expect(a92Resp.pending.type).toBe('choice')
    if (a92Resp.pending.type !== 'choice') return
    const acceptOption = a92Resp.pending.options.find((o) => o.value !== '__skip__')
    expect(acceptOption).toBeDefined()
    if (!acceptOption) return

    const afterAcceptResp = session.resolveChoice(0, acceptOption.value)
    expect(afterAcceptResp.ok).toBe(true)

    // The newborn→adult conversion fires in immediatelyAfter gain (after pay-resources runs).
    // At this point worker3 should be adult, FG space should have only 1 ref.
    // The extra place-farmer presents a space-selection choice.
    expect(afterAcceptResp.pending.type).toBe('choice')

    const p1Mid = afterAcceptResp.state.players[0]!
    const worker3Mid = p1Mid.workers.find((w) => w.id === '3')
    expect(worker3Mid).toBeDefined()
    expect(worker3Mid!.isActive).toBe(true)
    expect(worker3Mid!.isNewborn).toBe(false)

    // FG space takenBy should have only 1 ref now (parent; newborn ref removed)
    const fgSpaceMid = afterAcceptResp.state.actionSpaces.find((s) => s.id === 'wish-children')
    expect(fgSpaceMid!.takenBy).toHaveLength(1)
    expect(fgSpaceMid!.takenBy[0]!.workerId).toBe('1')

    // Legacy fields synced after conversion
    expect(p1Mid.newbornCount).toBe(0)
    // Food: started with 5, paid 1 → 4
    expect(p1Mid.resources.food).toBe(4)

    // Step 4: resolve the extra place-farmer space selection to complete the action.
    if (afterAcceptResp.pending.type !== 'choice') return
    const placeOption = afterAcceptResp.pending.options.find((o) => o.value !== '__skip__')
    if (placeOption) {
      const finalResp = session.resolveChoice(0, placeOption.value)
      expect(finalResp.ok).toBe(true)
    }
  })

  it('A92 skip: newborn remains in FG space, isNewborn stays true, no conversion', () => {
    const session = setup()

    // Step 1: Family Growth
    const fgResp = session.takeAction(0, 'wish-children')
    expect(fgResp.ok).toBe(true)
    expect(fgResp.pending.type).toBe('choice')
    if (fgResp.pending.type !== 'choice') return

    // Step 2: skip the optional minor-improvement → get A92 offer
    const a92Resp = session.resolveChoice(0, '__skip__')
    expect(a92Resp.ok).toBe(true)
    expect(a92Resp.pending.type).toBe('choice')
    if (a92Resp.pending.type !== 'choice') return

    // Step 3: skip the A92 offer
    const skipResp = session.resolveChoice(0, '__skip__')
    expect(skipResp.ok).toBe(true)

    const p1 = skipResp.state.players[0]!
    const worker3 = p1.workers.find((w) => w.id === '3')
    expect(worker3!.isNewborn).toBe(true)

    // FG space still has 2 refs (parent + newborn untouched)
    const fgSpace = skipResp.state.actionSpaces.find((s) => s.id === 'wish-children')
    expect(fgSpace!.takenBy).toHaveLength(2)

    // Legacy fields: newbornCount still 1, no food spent
    expect(p1.newbornCount).toBe(1)
    expect(p1.resources.food).toBe(5)
  })
})
