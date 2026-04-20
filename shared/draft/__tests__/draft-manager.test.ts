import { describe, expect, it } from 'vitest'
import type { DraftPool, DraftState } from '../types'
import type { GameState, PlayerState } from '../../game/types'
import {
  finalizeDraft,
  initDraftState,
  processSubmit,
  tryAdvanceRound,
} from '../draft-manager'

// ---------- helpers ----------

function makeHand(prefix: string, size: number): DraftPool {
  const occ: string[] = []
  const minor: string[] = []
  for (let i = 0; i < size; i++) {
    occ.push(`${prefix}_OCC_${i}`)
    minor.push(`${prefix}_MIN_${i}`)
  }
  return { occ, minor }
}

function makeHands(pids: string[], size: number): Record<string, DraftPool> {
  const out: Record<string, DraftPool> = {}
  for (const pid of pids) out[pid] = makeHand(pid, size)
  return out
}

/**
 * Simulate each player submitting their first card in pool (occ[0] + minor[0]).
 * Returns the state after all submissions (but before tryAdvanceRound).
 */
function submitFirstForAll(draft: DraftState): DraftState {
  let cur = draft
  for (const pid of cur.seatOrder) {
    const pool = cur.pools[pid]
    const r = processSubmit(cur, pid, { occCardId: pool.occ[0], minorCardId: pool.minor[0] })
    expect(r.error).toBeUndefined()
    cur = r.draft
  }
  return cur
}

function makePlayer(id: string): PlayerState {
  // Minimal PlayerState shape — only fields touched by finalizeDraft matter.
  return {
    id,
    occupationHand: [],
    minorHand: [],
  } as unknown as PlayerState
}

function makeStateWithDraft(pids: string[], draft: DraftState | null): GameState {
  return {
    phase: draft ? 'draft' : 'playing',
    draft,
    players: pids.map(makePlayer),
  } as unknown as GameState
}

// ---------- initDraftState ----------

describe('initDraftState', () => {
  it('2-player, poolSize=7 initializes pools/kept/pendingPicks', () => {
    const pids = ['p1', 'p2']
    const hands = makeHands(pids, 7)
    const d = initDraftState(pids, hands, 7)

    expect(d.mode).toBe('simultaneous')
    expect(d.round).toBe(1)
    expect(d.totalRounds).toBe(7)
    expect(d.poolSize).toBe(7)
    expect(d.seatOrder).toEqual(['p1', 'p2'])
    for (const pid of pids) {
      expect(d.pools[pid].occ).toEqual(hands[pid].occ)
      expect(d.pools[pid].minor).toEqual(hands[pid].minor)
      expect(d.kept[pid]).toEqual({ occ: [], minor: [] })
      expect(d.pendingPicks[pid]).toEqual({ occ: null, minor: null })
    }
  })

  it('3-player, poolSize=8 works', () => {
    const pids = ['p1', 'p2', 'p3']
    const hands = makeHands(pids, 8)
    const d = initDraftState(pids, hands, 8)

    expect(d.seatOrder).toEqual(pids)
    expect(d.poolSize).toBe(8)
    for (const pid of pids) {
      expect(d.pools[pid].occ).toHaveLength(8)
      expect(d.pools[pid].minor).toHaveLength(8)
    }
  })

  it('4-player, poolSize=10 works', () => {
    const pids = ['p1', 'p2', 'p3', 'p4']
    const hands = makeHands(pids, 10)
    const d = initDraftState(pids, hands, 10)

    expect(d.poolSize).toBe(10)
    for (const pid of pids) {
      expect(d.pools[pid].occ).toHaveLength(10)
      expect(d.pools[pid].minor).toHaveLength(10)
    }
  })

  it('throws when occ hand length does not match poolSize', () => {
    const hands = makeHands(['p1', 'p2'], 7)
    hands.p2 = { occ: hands.p2.occ.slice(0, 5), minor: hands.p2.minor }
    expect(() => initDraftState(['p1', 'p2'], hands, 7)).toThrow(/bad initial hand/)
  })

  it('throws when minor hand length does not match poolSize', () => {
    const hands = makeHands(['p1', 'p2'], 7)
    hands.p1 = { occ: hands.p1.occ, minor: hands.p1.minor.slice(0, 6) }
    expect(() => initDraftState(['p1', 'p2'], hands, 7)).toThrow(/bad initial hand/)
  })

  it('throws when seatOrder contains a player missing from hands', () => {
    const hands = makeHands(['p1', 'p2'], 7)
    expect(() => initDraftState(['p1', 'p2', 'p3'], hands, 7)).toThrow(/bad initial hand/)
  })

  it('defaults totalRounds to 7 when omitted', () => {
    const d = initDraftState(['p1', 'p2'], makeHands(['p1', 'p2'], 7), 7)
    expect(d.totalRounds).toBe(7)
  })

  it('accepts a custom totalRounds', () => {
    const d = initDraftState(['p1', 'p2'], makeHands(['p1', 'p2'], 9), 9, 9)
    expect(d.totalRounds).toBe(9)
  })

  it('does not alias the caller hands (pools are fresh copies)', () => {
    const hands = makeHands(['p1'], 7)
    const d = initDraftState(['p1'], hands, 7)
    hands.p1.occ.push('Z_EXTRA')
    expect(d.pools.p1.occ).toHaveLength(7)
  })
})

// ---------- processSubmit ----------

describe('processSubmit', () => {
  const pids = ['p1', 'p2']

  function makeInitial(): DraftState {
    return initDraftState(pids, makeHands(pids, 7), 7)
  }

  it('valid pick sets pendingPicks and returns no error', () => {
    const d = makeInitial()
    const res = processSubmit(d, 'p1', { occCardId: 'p1_OCC_0', minorCardId: 'p1_MIN_3' })

    expect(res.error).toBeUndefined()
    expect(res.draft.pendingPicks.p1).toEqual({ occ: 'p1_OCC_0', minor: 'p1_MIN_3' })
    // other player untouched
    expect(res.draft.pendingPicks.p2).toEqual({ occ: null, minor: null })
  })

  it('invalid occCardId (not in pool) returns error without mutating draft', () => {
    const d = makeInitial()
    const before = structuredClone(d)
    const res = processSubmit(d, 'p1', { occCardId: 'NOT_IN_POOL', minorCardId: 'p1_MIN_0' })

    expect(res.error).toMatch(/occ card not in pool/)
    // Returned draft should be the untouched original
    expect(res.draft).toBe(d)
    expect(d).toEqual(before)
  })

  it('invalid minorCardId (not in pool) returns error', () => {
    const d = makeInitial()
    const res = processSubmit(d, 'p1', { occCardId: 'p1_OCC_0', minorCardId: 'NOPE' })

    expect(res.error).toMatch(/minor card not in pool/)
    expect(res.draft).toBe(d)
  })

  it('unknown pid returns error', () => {
    const d = makeInitial()
    const res = processSubmit(d, 'p999', { occCardId: 'p1_OCC_0', minorCardId: 'p1_MIN_0' })

    expect(res.error).toMatch(/unknown player/)
    expect(res.draft).toBe(d)
  })

  it('second submit in same round by same player returns error', () => {
    const d = makeInitial()
    const first = processSubmit(d, 'p1', { occCardId: 'p1_OCC_0', minorCardId: 'p1_MIN_0' })
    expect(first.error).toBeUndefined()
    const second = processSubmit(first.draft, 'p1', {
      occCardId: 'p1_OCC_1',
      minorCardId: 'p1_MIN_1',
    })

    expect(second.error).toMatch(/already submitted/)
    // State should still hold the first submission
    expect(second.draft.pendingPicks.p1).toEqual({ occ: 'p1_OCC_0', minor: 'p1_MIN_0' })
  })

  it('does not mutate the input draft object on a valid submit', () => {
    const d = makeInitial()
    const snapshot = structuredClone(d)
    const res = processSubmit(d, 'p1', { occCardId: 'p1_OCC_0', minorCardId: 'p1_MIN_0' })

    expect(res.error).toBeUndefined()
    expect(d).toEqual(snapshot)
    // New object identity
    expect(res.draft).not.toBe(d)
  })
})

// ---------- tryAdvanceRound ----------

describe('tryAdvanceRound', () => {
  it('does nothing when not all players submitted', () => {
    const pids = ['p1', 'p2']
    const d0 = initDraftState(pids, makeHands(pids, 7), 7)
    const d1 = processSubmit(d0, 'p1', { occCardId: 'p1_OCC_0', minorCardId: 'p1_MIN_0' }).draft
    const snapshot = structuredClone(d1)

    const res = tryAdvanceRound(d1)

    expect(res.advanced).toBe(false)
    expect(res.finished).toBe(false)
    expect(res.draft).toBe(d1)
    expect(d1).toEqual(snapshot)
  })

  it('advances when all submitted (2p): rotates clockwise, appends kept, resets pendingPicks', () => {
    const pids = ['p1', 'p2']
    const d0 = initDraftState(pids, makeHands(pids, 7), 7)
    const submitted = submitFirstForAll(d0)

    const res = tryAdvanceRound(submitted)

    expect(res.advanced).toBe(true)
    expect(res.finished).toBe(false)
    expect(res.draft.round).toBe(2)

    // kept should have the just-picked card
    expect(res.draft.kept.p1.occ).toEqual(['p1_OCC_0'])
    expect(res.draft.kept.p1.minor).toEqual(['p1_MIN_0'])
    expect(res.draft.kept.p2.occ).toEqual(['p2_OCC_0'])
    expect(res.draft.kept.p2.minor).toEqual(['p2_MIN_0'])

    // pendingPicks reset
    for (const pid of pids) {
      expect(res.draft.pendingPicks[pid]).toEqual({ occ: null, minor: null })
    }

    // Rotation (2p): p1's pool (minus pick) -> p2, p2's pool (minus pick) -> p1
    // After rotation p1 holds what was originally p2's pool minus p2's pick.
    const expectedP1Occ = new Set(
      Array.from({ length: 7 }, (_, i) => `p2_OCC_${i}`).filter((c) => c !== 'p2_OCC_0'),
    )
    const expectedP1Minor = new Set(
      Array.from({ length: 7 }, (_, i) => `p2_MIN_${i}`).filter((c) => c !== 'p2_MIN_0'),
    )
    expect(new Set(res.draft.pools.p1.occ)).toEqual(expectedP1Occ)
    expect(new Set(res.draft.pools.p1.minor)).toEqual(expectedP1Minor)

    const expectedP2Occ = new Set(
      Array.from({ length: 7 }, (_, i) => `p1_OCC_${i}`).filter((c) => c !== 'p1_OCC_0'),
    )
    expect(new Set(res.draft.pools.p2.occ)).toEqual(expectedP2Occ)
    // Each rotated pool should have poolSize-1 cards since one was removed before rotation.
    expect(res.draft.pools.p1.occ).toHaveLength(6)
    expect(res.draft.pools.p2.occ).toHaveLength(6)
  })

  it('rotates clockwise for 3 players: p1->p2, p2->p3, p3->p1', () => {
    const pids = ['p1', 'p2', 'p3']
    const d0 = initDraftState(pids, makeHands(pids, 7), 7)
    const submitted = submitFirstForAll(d0)
    const res = tryAdvanceRound(submitted)

    expect(res.advanced).toBe(true)
    // p1 originally had p1_*; after rotation p2 should hold (a subset of) p1_*
    expect(res.draft.pools.p2.occ.every((c) => c.startsWith('p1_OCC_'))).toBe(true)
    // p2 originally had p2_*; after rotation p3 holds p2_*
    expect(res.draft.pools.p3.occ.every((c) => c.startsWith('p2_OCC_'))).toBe(true)
    // p3 originally had p3_*; after rotation p1 holds p3_*
    expect(res.draft.pools.p1.occ.every((c) => c.startsWith('p3_OCC_'))).toBe(true)
  })

  it('rotates clockwise for 4 players', () => {
    const pids = ['p1', 'p2', 'p3', 'p4']
    const d0 = initDraftState(pids, makeHands(pids, 10), 10)
    const submitted = submitFirstForAll(d0)
    const res = tryAdvanceRound(submitted)

    expect(res.draft.pools.p2.occ.every((c) => c.startsWith('p1_OCC_'))).toBe(true)
    expect(res.draft.pools.p3.occ.every((c) => c.startsWith('p2_OCC_'))).toBe(true)
    expect(res.draft.pools.p4.occ.every((c) => c.startsWith('p3_OCC_'))).toBe(true)
    expect(res.draft.pools.p1.occ.every((c) => c.startsWith('p4_OCC_'))).toBe(true)
  })

  it('picks are removed from pool BEFORE rotation — no player sees their own just-picked card', () => {
    const pids = ['p1', 'p2']
    const d0 = initDraftState(pids, makeHands(pids, 7), 7)
    const submitted = submitFirstForAll(d0)
    const res = tryAdvanceRound(submitted)

    // After rotation, no pool should contain the card that was just picked from its origin.
    // p1's pick p1_OCC_0 was removed before rotating to p2 — so p2 should NOT have it.
    expect(res.draft.pools.p2.occ).not.toContain('p1_OCC_0')
    expect(res.draft.pools.p2.minor).not.toContain('p1_MIN_0')
    expect(res.draft.pools.p1.occ).not.toContain('p2_OCC_0')
    expect(res.draft.pools.p1.minor).not.toContain('p2_MIN_0')
  })

  it('kept order grows by one entry per round in pick order', () => {
    const pids = ['p1', 'p2']
    let cur = initDraftState(pids, makeHands(pids, 7), 7)

    // Round 1: each picks their *_0
    for (const pid of cur.seatOrder) {
      const pool = cur.pools[pid]
      cur = processSubmit(cur, pid, { occCardId: pool.occ[0], minorCardId: pool.minor[0] }).draft
    }
    cur = tryAdvanceRound(cur).draft

    // Round 2: each picks their new *_0 (whatever that is after rotation)
    const r2p1Pick = cur.pools.p1.occ[0]
    const r2p2Pick = cur.pools.p2.occ[0]
    const r2p1MinorPick = cur.pools.p1.minor[0]
    const r2p2MinorPick = cur.pools.p2.minor[0]
    for (const pid of cur.seatOrder) {
      const pool = cur.pools[pid]
      cur = processSubmit(cur, pid, { occCardId: pool.occ[0], minorCardId: pool.minor[0] }).draft
    }
    const r2 = tryAdvanceRound(cur)

    expect(r2.draft.kept.p1.occ).toEqual(['p1_OCC_0', r2p1Pick])
    expect(r2.draft.kept.p1.minor).toEqual(['p1_MIN_0', r2p1MinorPick])
    expect(r2.draft.kept.p2.occ).toEqual(['p2_OCC_0', r2p2Pick])
    expect(r2.draft.kept.p2.minor).toEqual(['p2_MIN_0', r2p2MinorPick])
  })

  it('round=totalRounds with all submitted marks finished and round becomes totalRounds+1', () => {
    const pids = ['p1', 'p2']
    let cur = initDraftState(pids, makeHands(pids, 7), 7)
    let finished = false
    let advanceResult: ReturnType<typeof tryAdvanceRound> | null = null
    // Run 7 rounds
    for (let r = 0; r < 7; r++) {
      for (const pid of cur.seatOrder) {
        const pool = cur.pools[pid]
        cur = processSubmit(cur, pid, {
          occCardId: pool.occ[0],
          minorCardId: pool.minor[0],
        }).draft
      }
      advanceResult = tryAdvanceRound(cur)
      cur = advanceResult.draft
      finished = advanceResult.finished
    }

    expect(advanceResult).not.toBeNull()
    expect(advanceResult!.advanced).toBe(true)
    expect(finished).toBe(true)
    expect(cur.round).toBe(8) // totalRounds + 1
    expect(cur.kept.p1.occ).toHaveLength(7)
    expect(cur.kept.p1.minor).toHaveLength(7)
    expect(cur.kept.p2.occ).toHaveLength(7)
    expect(cur.kept.p2.minor).toHaveLength(7)
  })

  it('does not mutate the input draft when advancing', () => {
    const pids = ['p1', 'p2']
    const d0 = initDraftState(pids, makeHands(pids, 7), 7)
    const submitted = submitFirstForAll(d0)
    const snapshot = structuredClone(submitted)

    const res = tryAdvanceRound(submitted)

    expect(res.advanced).toBe(true)
    expect(submitted).toEqual(snapshot)
    expect(res.draft).not.toBe(submitted)
  })
})

// ---------- finalizeDraft ----------

describe('finalizeDraft', () => {
  it('writes kept into player.occupationHand/minorHand and clears draft', () => {
    const pids = ['p1', 'p2']
    const d0 = initDraftState(pids, makeHands(pids, 7), 7)
    let cur = d0
    for (let r = 0; r < 7; r++) {
      for (const pid of cur.seatOrder) {
        const pool = cur.pools[pid]
        cur = processSubmit(cur, pid, {
          occCardId: pool.occ[0],
          minorCardId: pool.minor[0],
        }).draft
      }
      cur = tryAdvanceRound(cur).draft
    }
    const state = makeStateWithDraft(pids, cur)

    const finalized = finalizeDraft(state)

    expect(finalized.phase).toBe('playing')
    expect(finalized.draft).toBeNull()
    const p1 = finalized.players.find((p) => p.id === 'p1')!
    const p2 = finalized.players.find((p) => p.id === 'p2')!
    expect(p1.occupationHand).toEqual(cur.kept.p1.occ)
    expect(p1.minorHand).toEqual(cur.kept.p1.minor)
    expect(p2.occupationHand).toEqual(cur.kept.p2.occ)
    expect(p2.minorHand).toEqual(cur.kept.p2.minor)
  })

  it('throws when called with draft === null', () => {
    const state = makeStateWithDraft(['p1', 'p2'], null)
    expect(() => finalizeDraft(state)).toThrow(/no draft/)
  })

  it('does not mutate the input state', () => {
    const pids = ['p1', 'p2']
    const draft = initDraftState(pids, makeHands(pids, 7), 7)
    // Hand-craft kept for a quick test
    draft.kept.p1 = { occ: ['A1'], minor: ['B1'] }
    draft.kept.p2 = { occ: ['A2'], minor: ['B2'] }
    const state = makeStateWithDraft(pids, draft)
    const snapshot = structuredClone(state)

    const finalized = finalizeDraft(state)

    expect(state).toEqual(snapshot)
    expect(finalized).not.toBe(state)
    expect(state.phase).toBe('draft')
    expect(state.draft).not.toBeNull()
    // But the finalized state has the writes
    const p1 = finalized.players.find((p) => p.id === 'p1')!
    expect(p1.occupationHand).toEqual(['A1'])
    expect(p1.minorHand).toEqual(['B1'])
  })

  it('returned occupationHand/minorHand are fresh arrays (not aliases of kept)', () => {
    const pids = ['p1']
    const draft = initDraftState(pids, makeHands(pids, 7), 7)
    draft.kept.p1 = { occ: ['A1'], minor: ['B1'] }
    const state = makeStateWithDraft(pids, draft)

    const finalized = finalizeDraft(state)
    const p1 = finalized.players.find((p) => p.id === 'p1')!
    // Mutating draft.kept after finalize should not affect the finalized hand
    draft.kept.p1.occ.push('LATE')
    expect(p1.occupationHand).toEqual(['A1'])
  })
})
