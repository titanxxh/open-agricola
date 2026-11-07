import { describe, expect, it } from 'vitest'
import { initDraftState, initStagedDraftState, processSubmit } from '../draft-manager'
import type { DraftPool, DraftState } from '../types'
import { draftSeatProgress } from '../../projections/draft-progress'
import { firstDraftPick } from './draft-fixtures'

const hands = (ids: string[], size: number): Record<string, DraftPool> => Object.fromEntries(ids.map(id => [id, {
  occ: Array.from({ length: size }, (_, n) => `${id}-o${n}`),
  minor: Array.from({ length: size }, (_, n) => `${id}-m${n}`),
}]))
const submit = (draft: DraftState, id: string) => {
  const result = processSubmit(draft, id, firstDraftPick(draft, id))
  if (result.kind !== 'accepted') throw new Error(result.error)
  return result
}

describe('asynchronous draft', () => {
  it('keeps three players moving until all four packets reach an idle seat, in order', () => {
    const ids = ['A', 'B', 'C', 'D']
    let draft = initDraftState(ids, hands(ids, 7), 7)
    for (const id of ['B', 'C', 'D', 'C', 'D', 'D']) draft = submit(draft, id).draft
    expect(ids.map(id => draftSeatProgress(draft, id).kept.occ.length)).toEqual([0, 1, 2, 3])
    expect(ids.map(id => draftSeatProgress(draft, id).kind)).toEqual(['selecting', 'waiting', 'waiting', 'waiting'])
    expect(Object.values(draft.stages[0].seats.A.inbox).map(pool => pool.occ[0])).toEqual(['A-o0', 'D-o1', 'C-o2', 'B-o3'])
    draft = submit(draft, 'A').draft
    const next = draftSeatProgress(draft, 'A')
    const woken = draftSeatProgress(draft, 'B')
    expect(next.kind === 'selecting' && next.pool.occ[0]).toBe('D-o1')
    expect(woken.kind === 'selecting' && woken.pool.occ[0]).toBe('A-o1')
  })

  it('does not change another players current opportunity or mutate input state', () => {
    const draft = initDraftState(['A', 'B'], hands(['A', 'B'], 7), 7)
    const before = structuredClone(draft)
    const pick = firstDraftPick(draft, 'B')
    const next = submit(draft, 'A').draft
    expect(draft).toEqual(before)
    expect(firstDraftPick(next, 'B')).toEqual(pick)
    expect(processSubmit(next, 'B', pick).kind).toBe('accepted')
  })

  it.each([7, 8, 9, 10])('keeps exactly seven cards per type from %i-card packets', size => {
    const ids = ['A', 'B']
    let draft = initDraftState(ids, hands(ids, size), size)
    let finished = false
    const picks = []
    for (let n = 0; n < 20 && !finished; n++) {
      const id = ids.find(id => draftSeatProgress(draft, id).kind === 'selecting')
      if (!id) throw new Error('deadlocked draft')
      const result = submit(draft, id)
      draft = result.draft
      finished = result.finished
      picks.push(...result.picks)
    }
    expect(finished).toBe(true)
    for (const id of ids) {
      expect(draftSeatProgress(draft, id).kept.occ).toHaveLength(7)
      expect(draftSeatProgress(draft, id).kept.minor).toHaveLength(7)
    }
    expect(picks).toHaveLength(14)
    expect(new Set(ids.flatMap(id => draftSeatProgress(draft, id).kept.occ)).size).toBe(14)
    expect(draft.stages[0].seats.A.inbox).toEqual({})
  })

  it('allows individual stage advancement while preserving each later starter before incoming packets', () => {
    const ids = ['A', 'B']
    let draft = initStagedDraftState(ids, [
      { kind: 'occupation', poolSize: 3, totalRounds: 2, pools: Object.fromEntries(ids.map(id => [id, { occ: hands(ids, 3)[id].occ, minor: [] }])) },
      { kind: 'publishedMinor', poolSize: 3, totalRounds: 2, pools: Object.fromEntries(ids.map(id => [id, { occ: [], minor: hands(ids, 3)[id].minor }])) },
    ])
    for (const id of ['B', 'A', 'A']) draft = submit(draft, id).draft
    const first = draftSeatProgress(draft, 'A')
    const second = draftSeatProgress(draft, 'B')
    expect(first.kind !== 'finished' && first.stage).toBe('publishedMinor')
    expect(second.kind !== 'finished' && second.stage).toBe('occupation')
    draft = submit(draft, 'A').draft
    expect(draft.stages[1].seats.B.inbox[1].minor[0]).toBe('B-m0')
    expect(draft.stages[1].seats.B.inbox[2].minor[0]).toBe('A-m1')
  })

  it('rejects stale opportunities, unknown players, and incomplete card pairs without moving packets', () => {
    const draft = initDraftState(['A', 'B'], hands(['A', 'B'], 7), 7)
    const pick = firstDraftPick(draft, 'A')
    expect(processSubmit(draft, 'ghost', pick).kind).toBe('rejected')
    expect(processSubmit(draft, 'A', { ...pick, opportunityKey: '0:2' }).kind).toBe('rejected')
    expect(processSubmit(draft, 'A', { opportunityKey: pick.opportunityKey, occCardId: pick.occCardId }).kind).toBe('rejected')
    const next = submit(submit(draft, 'B').draft, 'A').draft
    expect(processSubmit(next, 'A', pick)).toEqual({ kind: 'rejected', error: 'draft opportunity changed' })
  })

  it('rejects malformed initial deals and quotas', () => {
    expect(() => initDraftState(['A', 'B'], hands(['A'], 7), 7)).toThrow('bad initial hand')
    expect(() => initDraftState(['A'], hands(['A'], 7), 7, 8)).toThrow('invalid draft quota')
  })
})
