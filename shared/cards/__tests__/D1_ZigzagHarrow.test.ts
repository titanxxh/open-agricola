import { describe, expect, it } from 'vitest'
import { computeZigzagCandidates } from '../D/D1_ZigzagHarrow'
import { getRegisteredMinorImprovement } from '../registry-display'
import { requireActiveCardRegistry } from '../active-registry'
import '../D/D1_ZigzagHarrow'
import type { Field, PlayerState } from '../../contract/types'

const CARD_ID = 'D1_ZigzagHarrow'

const makeField = (row: number, col: number): Field => ({ row, col, stacks: [] })

const makePlayer = (fieldPositions: Array<[number, number]>): PlayerState =>
  ({
    id: 'p1',
    fields: fieldPositions.map(([r, c]) => makeField(r, c)),
  }) as unknown as PlayerState

const sortKey = (positions: { row: number; col: number }[]) =>
  positions.map((p) => `${p.row}-${p.col}`).sort()

describe('D1_ZigzagHarrow.computeZigzagCandidates (BGA geometry port)', () => {
  it('returns empty when player has no fields', () => {
    expect(computeZigzagCandidates(makePlayer([]))).toEqual([])
  })

  it('returns empty with a single field (no L corner possible)', () => {
    expect(computeZigzagCandidates(makePlayer([[1, 2]]))).toEqual([])
  })

  it('returns empty for two horizontally-adjacent fields (no second neighbor)', () => {
    expect(computeZigzagCandidates(makePlayer([[0, 0], [0, 1]]))).toEqual([])
  })

  it('returns empty for two vertically-adjacent fields', () => {
    expect(computeZigzagCandidates(makePlayer([[0, 0], [1, 0]]))).toEqual([])
  })

  it('returns empty for three fields in a straight horizontal line', () => {
    expect(computeZigzagCandidates(makePlayer([[0, 0], [0, 1], [0, 2]]))).toEqual([])
  })

  it('produces candidates for an L of 3 fields at (0,0)(0,1)(1,1)', () => {
    // L corner at (0,1): W=(0,0) field, S=(1,1) field, second-W=(0,0) field.
    // The S→W pair forms an L on the second iteration with current dir = W,
    // adding (row+1, col+1) and (row-1, col-1) relative to (0,1).
    const candidates = computeZigzagCandidates(makePlayer([[0, 0], [0, 1], [1, 1]]))
    expect(sortKey(candidates)).toEqual(['-1-0', '1-2'])
  })

  it('produces candidates for an L of 3 fields at (0,0)(1,0)(1,1)', () => {
    // L corner at (1,0): N=(0,0) field, E=(1,1) field → N→E pair, dir=E (else branch)
    // adds (row+1, col+1)=(2,1) and (row-1, col-1)=(0,-1).
    const candidates = computeZigzagCandidates(makePlayer([[0, 0], [1, 0], [1, 1]]))
    expect(sortKey(candidates)).toEqual(['0--1', '2-1'])
  })

  it('produces 4 deduped candidates for a 2x2 square of fields', () => {
    // Every corner of (0,0)(0,1)(1,0)(1,1) forms an L; union of candidates
    // includes 4 in-bounds outer-diagonal tiles + 4 OOB ones; BGA does not
    // filter to in-bounds, so we keep all 8 deduplicated coordinates.
    const candidates = computeZigzagCandidates(
      makePlayer([[0, 0], [0, 1], [1, 0], [1, 1]]),
    )
    const keys = new Set(sortKey(candidates))
    // In-bounds zigzag candidates (corners of a 2x2 block diagonally outward).
    expect(keys.has('0-2')).toBe(true)
    expect(keys.has('2-0')).toBe(true)
    expect(keys.has('1-2')).toBe(true)
    expect(keys.has('2-1')).toBe(true)
  })

  it('treats OOB neighbors as non-field (no L from edge)', () => {
    // (0,0) corner: W and N OOB; even with E + S fields it forms an L only on
    // N→E or E→S pairs — N is OOB so first pair fails; E→S can pair so
    // candidates from (0,0) come from the E→S corner.
    const candidates = computeZigzagCandidates(makePlayer([[0, 0], [0, 1], [1, 0]]))
    // (0,0): E=field a=1, S=field a=1 → L (dir=S, in [N,S]) → (1,-1), (-1,1)
    // (0,1): W=(0,0) field a=1, then N OOB → 0, E OOB → 0, S=(1,1) no, W(2nd) re-visit
    // (1,0): N=(0,0) field a=1, then E=(1,1) no → 0, S=(2,0) no, W OOB
    expect(sortKey(candidates)).toEqual(['-1-1', '1--1'])
  })
})

describe('D1_ZigzagHarrow.prerequisiteCheck (registered handler)', () => {
  it('is wired to zigzag candidate geometry, not a fields-count fallback', () => {
    const card = getRegisteredMinorImprovement(CARD_ID)!
    expect(card).toBeDefined()
    const check = requireActiveCardRegistry('D1 test').getPrerequisiteCheck(CARD_ID)!
    expect(check).toBeDefined()
    // Two adjacent fields (≥2) used to satisfy the old `fields.length >= 2`
    // fallback; BGA's `zigzag()` returns empty here — handler must reject.
    expect(check(makePlayer([[0, 0], [0, 1]]))).toBe(false)
    // L-shaped 3 fields produce candidates; handler must accept.
    expect(check(makePlayer([[0, 0], [0, 1], [1, 1]]))).toBe(true)
  })
})
