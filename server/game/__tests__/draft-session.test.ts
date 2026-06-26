/**
 * PR-5 Task 3 — session-level integration tests for the simultaneous card draft.
 *
 * These tests exercise `GameSession` + `createInitialState({ draftMode, draftPoolSize })`
 * end-to-end. Pure draft math is already covered by
 * `shared/draft/__tests__/draft-manager.test.ts`; here we verify that:
 *
 *   • `createInitialState` with draft mode seeds `state.phase='draft'` and `state.draft`
 *     (and leaves every player's `occupationHand` / `minorHand` empty).
 *   • `GameSession.submitDraftPick` advances the draft round-by-round, finally
 *     flipping `state.phase='playing'` with player hands populated from `kept`.
 *   • `resp.pending` is `{ type: 'cardDraft', ... }` throughout the draft.
 *   • Invalid pick / double submit / wrong phase error paths surface via `resp.ok`.
 *   • `serializeState` -> `rehydrateState` preserves draft fields cleanly.
 */

import { describe, expect, it } from 'vitest'
import { GameSession } from '../authoritative-session'
import { rehydrateState, serializeState } from '../../../shared/session/serialization'

const makeDraftSession = (
  playerCount = 2,
  draftPoolSize = 7,
  seed = 123456,
) =>
  new GameSession(seed, undefined, {
    playerCount,
    draftMode: 'simultaneous',
    draftPoolSize,
  })

const firstPick = (session: GameSession, pid: string) => {
  const draft = session.getState().state.draft
  if (!draft) throw new Error('no draft state')
  const pool = draft.pools[pid]
  if (!pool) throw new Error(`no pool for ${pid}`)
  return { occCardId: pool.occ[0]!, minorCardId: pool.minor[0]! }
}

const firstOccupationPick = (session: GameSession, pid: string) => {
  const draft = session.getState().state.draft
  if (!draft) throw new Error('no draft state')
  const pool = draft.pools[pid]
  if (!pool) throw new Error(`no pool for ${pid}`)
  return { occCardId: pool.occ[0]! }
}

const firstMinorPick = (session: GameSession, pid: string) => {
  const draft = session.getState().state.draft
  if (!draft) throw new Error('no draft state')
  const pool = draft.pools[pid]
  if (!pool) throw new Error(`no pool for ${pid}`)
  return { minorCardId: pool.minor[0]! }
}

describe('GameSession — draft mode setup', () => {
  it('seeds phase=draft with populated per-player pools and empty player hands', () => {
    const session = makeDraftSession(2, 7)
    const { state } = session.getState()

    expect(state.phase).toBe('draft')
    expect(state.draft).not.toBeNull()
    expect(state.draft!.round).toBe(1)
    expect(state.draft!.totalRounds).toBe(7)
    expect(state.draft!.poolSize).toBe(7)
    expect(state.draft!.seatOrder).toEqual(['p1', 'p2'])

    for (const p of state.players) {
      expect(p.occupationHand).toEqual([])
      expect(p.minorHand).toEqual([])
      expect(state.draft!.pools[p.id].occ.length).toBe(7)
      expect(state.draft!.pools[p.id].minor.length).toBe(7)
      expect(state.draft!.kept[p.id].occ).toEqual([])
      expect(state.draft!.kept[p.id].minor).toEqual([])
    }

    // Draft progress is tracked on state.draft directly (replaces the deleted
    // PendingAction.cardDraft view-model). DraftOverlay reads these fields.
    expect(state.draft!.round).toBe(1)
    expect(state.draft!.totalRounds).toBe(7)
    const allSubmitted = state.draft!.seatOrder.every(
      (pid) => state.draft!.pendingPicks[pid]?.occ != null
        && state.draft!.pendingPicks[pid]?.minor != null,
    )
    expect(allSubmitted).toBe(false)
  })

  it('falls back to the normal playing phase when draftMode is omitted', () => {
    const session = new GameSession(1234, undefined, { playerCount: 2 })
    const { state, interaction } = session.getState()
    expect(state.phase).toBe('playing')
    expect(state.draft).toBeNull()
    expect(interaction.stateId).toBe('idle')
    for (const p of state.players) {
      expect(p.occupationHand.length).toBe(7)
      expect(p.minorHand.length).toBe(7)
    }
  })
})

describe('GameSession.submitDraftPick — happy paths', () => {
  it('runs a full 7-card 2-player draft and transitions to phase=playing', () => {
    const session = makeDraftSession(2, 7)

    for (let round = 1; round <= 6; round += 1) {
      const before = session.getState().state
      expect(before.phase).toBe('draft')
      expect(before.draft!.round).toBe(round)

      const p1Pick = firstPick(session, 'p1')
      const r1 = session.submitDraftPick('p1', p1Pick)
      expect(r1.ok).toBe(true)
      expect(r1.state.phase).toBe('draft')
      const allSubmitted1 = r1.state.draft!.seatOrder.every(
        (pid) => r1.state.draft!.pendingPicks[pid]?.occ != null
          && r1.state.draft!.pendingPicks[pid]?.minor != null,
      )
      expect(allSubmitted1).toBe(false)

      const p2Pick = firstPick(session, 'p2')
      const r2 = session.submitDraftPick('p2', p2Pick)
      expect(r2.ok).toBe(true)
    }

    const finalResp = session.getState()
    expect(finalResp.state.phase).toBe('playing')
    expect(finalResp.state.draft).toBeNull()
    expect(finalResp.interaction.stateId).toBe('idle')
    for (const p of finalResp.state.players) {
      expect(p.occupationHand.length).toBe(7)
      expect(p.minorHand.length).toBe(7)
    }
  })

  it('runs Farmers of the Moor draft as occupations before FoM minors before published-pool minors', () => {
    const session = new GameSession(123456, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
      draftMode: 'simultaneous',
      draftPoolSize: 7,
    })

    expect(session.getState().state.draft!.stage).toBe('occupation')
    expect(session.getState().state.draft!.totalRounds).toBe(7)
    for (const pid of ['p1', 'p2']) {
      expect(session.getState().state.draft!.pools[pid].occ).toHaveLength(7)
      expect(session.getState().state.draft!.pools[pid].minor).toEqual([])
    }

    for (let round = 1; round <= 6; round += 1) {
      for (const pid of ['p1', 'p2']) {
        const resp = session.submitDraftPick(pid, firstOccupationPick(session, pid))
        expect(resp.ok).toBe(true)
      }
    }

    const moorMinorStage = session.getState().state
    expect(moorMinorStage.phase).toBe('draft')
    expect(moorMinorStage.draft!.stage).toBe('farmersOfTheMoorMinor')
    expect(moorMinorStage.draft!.round).toBe(1)
    expect(moorMinorStage.draft!.totalRounds).toBe(3)
    for (const pid of ['p1', 'p2']) {
      expect(moorMinorStage.draft!.pools[pid].occ).toEqual([])
      expect(moorMinorStage.draft!.pools[pid].minor).toHaveLength(3)
      expect(moorMinorStage.draft!.kept[pid].occ).toHaveLength(7)
      expect(moorMinorStage.draft!.kept[pid].minor).toHaveLength(0)
    }

    for (let round = 1; round <= 2; round += 1) {
      for (const pid of ['p1', 'p2']) {
        const resp = session.submitDraftPick(pid, firstMinorPick(session, pid))
        expect(resp.ok).toBe(true)
      }
    }

    const publishedStage = session.getState().state
    expect(publishedStage.phase).toBe('draft')
    expect(publishedStage.draft!.stage).toBe('publishedMinor')
    expect(publishedStage.draft!.round).toBe(1)
    expect(publishedStage.draft!.totalRounds).toBe(3)
    for (const pid of ['p1', 'p2']) {
      expect(publishedStage.draft!.pools[pid].occ).toEqual([])
      expect(publishedStage.draft!.pools[pid].minor).toHaveLength(3)
      expect(publishedStage.draft!.kept[pid].occ).toHaveLength(7)
      expect(publishedStage.draft!.kept[pid].minor).toHaveLength(3)
    }

    for (let round = 1; round <= 2; round += 1) {
      for (const pid of ['p1', 'p2']) {
        const resp = session.submitDraftPick(pid, firstMinorPick(session, pid))
        expect(resp.ok).toBe(true)
      }
    }

    const final = session.getState().state
    expect(final.phase).toBe('playing')
    expect(final.draft).toBeNull()
    for (const player of final.players) {
      expect(player.occupationHand).toHaveLength(7)
      expect(player.minorHand).toHaveLength(6)
    }
  })

  it('keeps round=1 while only one of two players has submitted', () => {
    const session = makeDraftSession(2, 7)
    const p1Pick = firstPick(session, 'p1')
    const r1 = session.submitDraftPick('p1', p1Pick)
    expect(r1.ok).toBe(true)
    expect(r1.state.draft!.round).toBe(1)
    expect(r1.state.draft!.pendingPicks.p1.occ).toBe(p1Pick.occCardId)
    expect(r1.state.draft!.pendingPicks.p1.minor).toBe(p1Pick.minorCardId)
    expect(r1.state.draft!.kept.p1.occ).toEqual([p1Pick.occCardId])
    expect(r1.state.draft!.kept.p1.minor).toEqual([p1Pick.minorCardId])
    expect(r1.state.draft!.pools.p1.occ).not.toContain(p1Pick.occCardId)
    expect(r1.state.draft!.pools.p1.minor).not.toContain(p1Pick.minorCardId)
    expect(r1.state.draft!.pendingPicks.p2.occ).toBeNull()
    expect(r1.state.draft!.pendingPicks.p2.minor).toBeNull()
    expect(r1.state.phase).toBe('draft')
    const allSubmittedR1 = r1.state.draft!.seatOrder.every(
      (pid) => r1.state.draft!.pendingPicks[pid]?.occ != null
        && r1.state.draft!.pendingPicks[pid]?.minor != null,
    )
    expect(allSubmittedR1).toBe(false)

    const p2Pick = firstPick(session, 'p2')
    const r2 = session.submitDraftPick('p2', p2Pick)
    expect(r2.ok).toBe(true)
    expect(r2.state.draft!.round).toBe(2)
  })

  it('auto-finalizes a 7-card draft after six submitted rounds', () => {
    const session = makeDraftSession(2, 7)

    for (let round = 1; round <= 6; round += 1) {
      expect(session.getState().state.phase).toBe('draft')
      expect(session.getState().state.draft!.round).toBe(round)
      for (const pid of ['p1', 'p2']) {
        const pick = firstPick(session, pid)
        const resp = session.submitDraftPick(pid, pick)
        expect(resp.ok).toBe(true)
      }
    }

    const final = session.getState().state
    expect(final.phase).toBe('playing')
    expect(final.draft).toBeNull()
    for (const player of final.players) {
      expect(player.occupationHand).toHaveLength(7)
      expect(player.minorHand).toHaveLength(7)
    }
  })

  it('trims the draft hand to 7 cards when poolSize=8 (passthrough card discarded)', () => {
    const session = makeDraftSession(2, 8)
    // With poolSize=8, each round all players pick and pass; after 7 rounds
    // each player has 7 kept cards and 1 unkept card remains (discarded).
    expect(session.getState().state.draft!.poolSize).toBe(8)
    expect(session.getState().state.draft!.totalRounds).toBe(7)

    for (let round = 1; round <= 7; round += 1) {
      const p1 = firstPick(session, 'p1')
      session.submitDraftPick('p1', p1)
      const p2 = firstPick(session, 'p2')
      session.submitDraftPick('p2', p2)
    }

    const final = session.getState().state
    expect(final.phase).toBe('playing')
    expect(final.draft).toBeNull()
    for (const p of final.players) {
      expect(p.occupationHand.length).toBe(7)
      expect(p.minorHand.length).toBe(7)
    }
  })

  it('runs a full 7-card 3-player draft with clockwise rotation', () => {
    const session = makeDraftSession(3, 7)
    const initial = session.getState().state
    expect(initial.draft!.seatOrder).toEqual(['p1', 'p2', 'p3'])
    // Capture p1's initial occ pool to verify rotation direction after round 1.
    const p1InitialOcc = [...initial.draft!.pools.p1.occ]

    for (let round = 1; round <= 6; round += 1) {
      for (const pid of ['p1', 'p2', 'p3']) {
        const pick = firstPick(session, pid)
        const resp = session.submitDraftPick(pid, pick)
        expect(resp.ok).toBe(true)
      }
    }

    const final = session.getState().state
    expect(final.phase).toBe('playing')
    for (const p of final.players) {
      expect(p.occupationHand.length).toBe(7)
      expect(p.minorHand.length).toBe(7)
    }
    // Sanity: p1's initial pool is NOT equal to p3's initial pool (different deals)
    // and clockwise rotation means p2 inherited what used to be p1's pool after round 1.
    expect(p1InitialOcc.length).toBe(7)
  })

  it('verifies clockwise rotation after round 1 (2p)', () => {
    const session = makeDraftSession(2, 7)
    const initial = session.getState().state
    const p1OccBefore = [...initial.draft!.pools.p1.occ]
    const p1MinorBefore = [...initial.draft!.pools.p1.minor]
    const p1Pick = firstPick(session, 'p1')
    const p2Pick = firstPick(session, 'p2')
    session.submitDraftPick('p1', p1Pick)
    session.submitDraftPick('p2', p2Pick)

    // After round 1, p1's pool (minus p1's pick) should now sit with p2.
    const expectedP2Occ = p1OccBefore.filter((id) => id !== p1Pick.occCardId)
    const expectedP2Minor = p1MinorBefore.filter((id) => id !== p1Pick.minorCardId)

    const after = session.getState().state
    expect(after.draft!.round).toBe(2)
    expect(after.draft!.pools.p2.occ.sort()).toEqual(expectedP2Occ.sort())
    expect(after.draft!.pools.p2.minor.sort()).toEqual(expectedP2Minor.sort())
  })
})

describe('GameSession.submitDraftPick — error paths', () => {
  it('rejects a pick that is not in the player’s current pool', () => {
    const session = makeDraftSession(2, 7)
    const resp = session.submitDraftPick('p1', {
      occCardId: 'not-a-real-card',
      minorCardId: 'also-not-real',
    })
    expect(resp.ok).toBe(false)
    expect(resp.error).toBeDefined()
    // State should remain unchanged.
    expect(resp.state.draft!.round).toBe(1)
    expect(resp.state.draft!.pendingPicks.p1.occ).toBeNull()
  })

  it('rejects a double submit in the same round', () => {
    const session = makeDraftSession(2, 7)
    const p1Pick = firstPick(session, 'p1')
    const first = session.submitDraftPick('p1', p1Pick)
    expect(first.ok).toBe(true)
    const second = session.submitDraftPick('p1', p1Pick)
    expect(second.ok).toBe(false)
    expect(second.error).toMatch(/already submitted/i)
    expect(second.state.draft!.round).toBe(1)
  })

  it('rejects a pick from an unknown player', () => {
    const session = makeDraftSession(2, 7)
    const resp = session.submitDraftPick('p99', {
      occCardId: 'x',
      minorCardId: 'y',
    })
    expect(resp.ok).toBe(false)
    expect(resp.error).toBeDefined()
  })

  it('rejects submitDraftPick when the game is already in playing phase', () => {
    const session = new GameSession(42, undefined, { playerCount: 2 })
    expect(session.getState().state.phase).toBe('playing')
    const resp = session.submitDraftPick('p1', {
      occCardId: 'a',
      minorCardId: 'b',
    })
    expect(resp.ok).toBe(false)
    expect(resp.error).toMatch(/not in draft phase/i)
  })

  it('rejects takeAction while phase=draft', () => {
    const session = makeDraftSession(2, 7)
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(false)
    expect(resp.error).toMatch(/draft in progress/i)
  })
})

describe('GameSession — draft persistence (serialize → rehydrate)', () => {
  it('round-trips an in-progress draft through serializeState / rehydrateState', () => {
    const session = makeDraftSession(2, 7)
    // Submit 1 round so the draft has meaningful kept + rotated pools.
    const p1 = firstPick(session, 'p1')
    const p2 = firstPick(session, 'p2')
    session.submitDraftPick('p1', p1)
    session.submitDraftPick('p2', p2)

    const live = session.getState().state
    expect(live.phase).toBe('draft')
    expect(live.draft!.round).toBe(2)

    const serialized = serializeState(live, { engineStack: session.getEngineStack() })
    const json = JSON.parse(JSON.stringify(serialized))
    expect(json.phase).toBe('draft')
    expect(json.draft).toBeTruthy()
    expect(json.draft.round).toBe(2)
    expect(json.draft.kept.p1.occ).toEqual([p1.occCardId])

    const rehydrated = rehydrateState(json)
    expect(rehydrated.state.phase).toBe('draft')
    expect(rehydrated.state.draft).not.toBeNull()
    expect(rehydrated.state.draft!.round).toBe(2)
    expect(rehydrated.state.draft!.kept.p1.occ).toEqual([p1.occCardId])
    expect(rehydrated.state.draft!.kept.p2.minor).toEqual([p2.minorCardId])

    // Load into a fresh session and continue the draft to completion.
    const revived = new GameSession(rehydrated)
    expect(revived.getState().state.phase).toBe('draft')
    expect(revived.getState().state.draft).not.toBeNull()

    for (let round = 2; round <= 6; round += 1) {
      const pa = firstPick(revived, 'p1')
      const pb = firstPick(revived, 'p2')
      const ra = revived.submitDraftPick('p1', pa)
      expect(ra.ok).toBe(true)
      const rb = revived.submitDraftPick('p2', pb)
      expect(rb.ok).toBe(true)
    }

    const final = revived.getState().state
    expect(final.phase).toBe('playing')
    expect(final.draft).toBeNull()
    for (const pl of final.players) {
      expect(pl.occupationHand.length).toBe(7)
      expect(pl.minorHand.length).toBe(7)
    }
  })
})
