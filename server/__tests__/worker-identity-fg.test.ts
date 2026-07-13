import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRoundPlacementOrder } from '../../shared/cards/helpers/round-placement'
import { computeHarvestFeedingRequirement } from '../../shared/actions/helpers/harvest-feeding-requirement'

import { setActiveWorkerCount, setWorkersAtHome, familySize, newbornCount } from '../../shared/domain/player'
import '../../shared/cards/A/A092_AdoptiveParents'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

describe('worker-identity: family growth pushes newborn to FG space takenBy', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    // Round 2+ so wish-children is available
    state.round = 2

    const player = state.players[0]!
    // 2 initial active workers (ids '1', '2'), worker '3' is inactive
    // rooms=3 > familySize=2 so growth is allowed
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
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
    expect(familySize(p1)).toBe(3)
    // newbornCount legacy field incremented
    expect(newbornCount(p1)).toBe(1)

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
    setActiveWorkerCount(player, 2)
    session.loadState(state)

    // takeAction still returns ok:true (soft fail — the action fails but the call succeeds),
    // but the family growth effect should not apply.
    const resp = session.takeAction(0, 'wish-children')
    expect(resp.ok).toBe(true)

    const p1 = resp.state.players[0]!
    // familySize stays at 2 — growth was blocked
    expect(familySize(p1)).toBe(2)
    expect(newbornCount(p1)).toBe(0)
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
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
    session.loadState(state)

    const resp = session.takeAction(0, 'urgent-wish-children')
    expect(resp.ok).toBe(true)

    const p1 = resp.state.players[0]!
    // Family grew even without spare room
    expect(familySize(p1)).toBe(3)
    expect(newbornCount(p1)).toBe(1)

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
  // Deterministic setup: pass a fixed seed AND explicitly overwrite both players'
  // minor/occupation hands with non-card placeholders. This avoids two sources of
  // flake:
  //   1) `new GameSession()` calls `createSeed()` → `Math.random()` → different
  //      hands every run.
  //   2) `loadState` → `normalizeState` re-deals hands when ANY player has an
  //      empty hand, so we cannot just clear them.
  // With placeholder ids the hands stay non-empty (no re-deal) but the cards are
  // unknown to every registry/listener, so wish-children's
  // `optional(minor-improvement)` finds zero playable minors and the optional host
  // resolves silently, putting A92's offer as the very next pending choice.
  const FILLER = '__test_filler__'
  const setup = () => {
    const session = new GameSession(/* seed */ 1)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 2

    for (const p of state.players) {
      p.minorHand = [FILLER]
      p.occupationHand = [FILLER]
    }

    const player = state.players[0]!
    // 2 initial active workers (ids '1', '2'), worker '3' is inactive
    // rooms=3 > familySize=2 so growth is allowed
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
    player.rooms = 3
    player.resources.food = 5 // enough to pay A92's 1 food cost

    // Mark A92 as played
    player.occupationPlayed.push('A092_AdoptiveParents')

    session.loadState(state)
    return session
  }

  const A092_ANYTIME = 'A92-adoptive-parents-anytime-grow'

  // Drain the FG flow's own optional minor-improvement tail (stop before the
  // rotation confirm) so the engine is back to an interactive window where the
  // A92 anytime grow-only entry is offered. Under the BGA pull model A92 no
  // longer auto-pushes a grow after FG — it is a `phases:['anytime']` listener
  // the player must invoke explicitly.
  const drainFgPrompts = (
    session: GameSession,
    initial: ReturnType<typeof session.takeAction>,
  ) => {
    let resp = initial
    let guard = 0
    while (resp.interaction.stateId === 'wait' && guard++ < 8) {
      if (resp.interaction.request.kind === 'confirm-next-player') break
      resp = session.resolveChoice(0, '__skip__')
    }
    return resp
  }

  it('A92 capability A: anytime grow-only removes newborn WorkerRef from FG space, flips isNewborn=false', () => {
    const session = setup()

    // Step 1: do Family Growth — wish-children places parent worker '1' + newborn '3' on space.
    const fgResp = session.takeAction(0, 'wish-children')
    expect(fgResp.ok).toBe(true)
    expect(fgResp.state.actionSpaces.find((s) => s.id === 'wish-children')!.takenBy).toHaveLength(2)
    expect(newbornCount(fgResp.state.players[0]!)).toBe(1)

    // Step 2: drain the FG flow's own optional tail.
    drainFgPrompts(session, fgResp)
    const foodBefore = session.getState().state.players[0]!.resources.food

    // Step 3: capability A — invoke the anytime grow-only entry. Pay 1 food,
    // promote the newborn off the FG space (child→adult). No place-farmer, so
    // alternation with the opponent is preserved.
    const grown = session.takeAnytimeAction(0, A092_ANYTIME)
    expect(grown.ok).toBe(true)

    const p1Mid = session.getState().state.players[0]!
    const worker3Mid = p1Mid.workers.find((w) => w.id === '3')
    expect(worker3Mid).toBeDefined()
    expect(worker3Mid!.isActive).toBe(true)
    expect(worker3Mid!.isNewborn).toBe(false)

    // FG space takenBy should have only 1 ref now (parent; promoted worker left).
    const fgSpaceMid = session.getState().state.actionSpaces.find((s) => s.id === 'wish-children')
    expect(fgSpaceMid!.takenBy.filter((r) => r.playerId === p1Mid.id)).toHaveLength(1)
    expect(fgSpaceMid!.takenBy[0]!.workerId).toBe('1')

    // Legacy fields synced after conversion; 1 food paid.
    expect(newbornCount(p1Mid)).toBe(0)
    expect(p1Mid.resources.food).toBe(foodBefore - 1)
  })

  it('A92 capability A: not invoking the anytime entry leaves the newborn parked on the FG space', () => {
    const session = setup()

    // Step 1: Family Growth.
    const fgResp = session.takeAction(0, 'wish-children')
    expect(fgResp.ok).toBe(true)

    // Step 2: drain the FG flow but never invoke A92's anytime grow.
    const idle = drainFgPrompts(session, fgResp)

    const p1 = idle.state.players[0]!
    const worker3 = p1.workers.find((w) => w.id === '3')
    expect(worker3!.isNewborn).toBe(true)

    // FG space still has 2 refs (parent + newborn untouched).
    const fgSpace = session.getState().state.actionSpaces.find((s) => s.id === 'wish-children')
    expect(fgSpace!.takenBy.filter((r) => r.playerId === p1.id)).toHaveLength(2)

    // Legacy fields: newbornCount still 1, no food spent.
    expect(newbornCount(p1)).toBe(1)
    expect(p1.resources.food).toBe(5)
  })

  it('A92 capability A: two newborns can be promoted by separate anytime uses', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    setActiveWorkerCount(player, 4)
    player.resources.food = 5
    const newbornWorkers = player.workers.filter((w) => w.isActive).slice(2, 4)
    for (const [index, worker] of newbornWorkers.entries()) {
      worker.isNewborn = true
      const space = state.actionSpaces.find((s) => s.id === (index === 0 ? 'forest' : 'clay-pit'))!
      space.takenBy = [{ playerId: player.id, workerId: worker.id }] as typeof space.takenBy
    }
    session.loadState(state)

    const plow = session.takeAction(0, 'farmland')
    expect(plow.ok).toBe(true)
    expect(newbornCount(plow.state.players[0]!)).toBe(2)

    const first = session.takeAnytimeAction(0, A092_ANYTIME)
    expect(first.ok).toBe(true)
    expect(newbornCount(session.getState().state.players[0]!)).toBe(1)

    const second = session.takeAnytimeAction(0, A092_ANYTIME)
    expect(second.ok).toBe(true)
    const after = session.getState().state.players[0]!
    expect(newbornCount(after)).toBe(0)
    expect(after.resources.food).toBe(3)
  })

  it('A92 capability A: promoted newborn feeds as an adult', () => {
    const session = setup()
    const fgResp = session.takeAction(0, 'wish-children')
    expect(fgResp.ok).toBe(true)
    drainFgPrompts(session, fgResp)

    const before = session.getState().state
    expect(computeHarvestFeedingRequirement(before, before.players[0]!)).toBe(5)

    const grown = session.takeAnytimeAction(0, A092_ANYTIME)
    expect(grown.ok).toBe(true)

    const after = session.getState().state
    expect(newbornCount(after.players[0]!)).toBe(0)
    expect(computeHarvestFeedingRequirement(after, after.players[0]!)).toBe(6)
  })
})
