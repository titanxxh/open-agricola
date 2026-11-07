import { describe, expect, it } from 'vitest'
import { migrateLegacyDraft } from '../legacy-draft'
import partial from './fixtures/standard-partial.json'
import rotated from './fixtures/standard-rotated.json'
import moor from './fixtures/moor-published.json'

describe('global-round to per-seat draft migration', () => {
  it('passes only the submitted seat remainder and never selects its kept cards again', () => {
    const migrated = migrateLegacyDraft(partial.draft)
    expect(migrated?.stages[0].seats).toEqual({
      p1: { kept: partial.draft.kept.p1, inbox: {} },
      p2: { kept: { occ: [], minor: [] }, inbox: { 1: partial.draft.pools.p2, 2: partial.draft.pools.p1 } },
    })
    expect(migrateLegacyDraft(migrated)).toBeUndefined()
  })

  it('retains the current rotation and delivers the already confirmed third packet as generation four', () => {
    const migrated = migrateLegacyDraft(rotated.draft)
    expect(migrated?.stages[0].seats).toEqual({
      p1: { kept: rotated.draft.kept.p1, inbox: { 3: rotated.draft.pools.p1, 4: rotated.draft.pools.p2 } },
      p2: { kept: rotated.draft.kept.p2, inbox: {} },
    })
  })

  it('partitions earlier-stage kept cards without re-dealing the published-minor stage', () => {
    const migrated = migrateLegacyDraft(moor.draft)
    expect(migrated?.stages[0].seats.p1.kept).toEqual({ occ: moor.draft.kept.p1.occ, minor: [] })
    expect(migrated?.stages[1].seats.p2.kept).toEqual({ occ: [], minor: moor.draft.kept.p2.minor.slice(0, 4) })
    expect(migrated?.stages[2].seats.p2.kept).toEqual({ occ: [], minor: [moor.draft.pendingPicks.p2.minor] })
    expect(migrated?.stages[2].seats.p1.inbox).toEqual({ 1: moor.draft.pools.p1, 2: moor.draft.pools.p2 })
  })

  it.each([
    { ...partial.draft, round: 0 },
    { ...partial.draft, stages: [], stageIndex: 0 },
    { ...partial.draft, seatOrder: ['p1', 'p1'] },
    { ...partial.draft, kept: { ...partial.draft.kept, p1: { occ: [], minor: [] } } },
    { ...partial.draft, pendingPicks: { ...partial.draft.pendingPicks, p1: { occ: partial.draft.pendingPicks.p1.occ, minor: null } } },
    { ...moor.draft, stageIndex: 7 },
  ])('rejects inconsistent retained data instead of inventing progress %#', raw => {
    expect(() => migrateLegacyDraft(raw)).toThrow('Invalid legacy global-round draft')
  })
})
