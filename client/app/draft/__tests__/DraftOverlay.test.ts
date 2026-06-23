import { describe, expect, test } from 'vitest'
import { canSubmitPick, computeDraftViewModel, type DraftViewModel } from '../DraftOverlay'
import type { DraftState } from '../../../../shared/draft/types'

const mkDraft = (overrides: Partial<DraftState> = {}): DraftState => ({
  mode: 'simultaneous',
  round: 1,
  totalRounds: 7,
  poolSize: 7,
  seatOrder: ['p1', 'p2'],
  pools: {
    p1: { occ: ['A001', 'A002', 'A003'], minor: ['B001', 'B002', 'B003'] },
    p2: { occ: ['A101', 'A102'], minor: ['B101', 'B102'] },
  },
  kept: {
    p1: { occ: [], minor: [] },
    p2: { occ: [], minor: [] },
  },
  pendingPicks: {
    p1: { occ: null, minor: null },
    p2: { occ: null, minor: null },
  },
  ...overrides,
})

describe('computeDraftViewModel', () => {
  test('extracts the local player slice and defaults missing entries', () => {
    const draft = mkDraft()
    const vm = computeDraftViewModel(draft, 'p1')
    expect(vm.round).toBe(1)
    expect(vm.stage).toBe('standard')
    expect(vm.totalRounds).toBe(7)
    expect(vm.seatCount).toBe(2)
    expect(vm.submittedCount).toBe(0)
    expect(vm.myPool.occ).toEqual(['A001', 'A002', 'A003'])
    expect(vm.myPool.minor).toEqual(['B001', 'B002', 'B003'])
    expect(vm.alreadySubmitted).toBe(false)
  })

  test('returns empty pools when meId is not in draft (defensive)', () => {
    const draft = mkDraft()
    const vm = computeDraftViewModel(draft, 'ghost')
    expect(vm.myPool.occ).toEqual([])
    expect(vm.myPool.minor).toEqual([])
    expect(vm.myKept.occ).toEqual([])
    expect(vm.myKept.minor).toEqual([])
    expect(vm.myPending.occ).toBeNull()
    expect(vm.myPending.minor).toBeNull()
  })

  test('alreadySubmitted true only when both occ and minor picks recorded', () => {
    const halfPick = mkDraft({
      pendingPicks: {
        p1: { occ: 'A001', minor: null },
        p2: { occ: null, minor: null },
      },
    })
    expect(computeDraftViewModel(halfPick, 'p1').alreadySubmitted).toBe(false)

    const fullPick = mkDraft({
      pendingPicks: {
        p1: { occ: 'A001', minor: 'B001' },
        p2: { occ: null, minor: null },
      },
    })
    expect(computeDraftViewModel(fullPick, 'p1').alreadySubmitted).toBe(true)
  })

  test('alreadySubmitted follows the active staged draft card type', () => {
    const occupationStage = mkDraft({
      stage: 'occupation',
      pendingPicks: {
        p1: { occ: 'A001', minor: null },
        p2: { occ: null, minor: null },
      },
    })
    expect(computeDraftViewModel(occupationStage, 'p1').alreadySubmitted).toBe(true)

    const minorStage = mkDraft({
      stage: 'publishedMinor',
      pendingPicks: {
        p1: { occ: null, minor: 'B001' },
        p2: { occ: null, minor: null },
      },
    })
    expect(computeDraftViewModel(minorStage, 'p1').alreadySubmitted).toBe(true)
  })

  test('submittedCount counts only fully-submitted players', () => {
    const draft = mkDraft({
      seatOrder: ['p1', 'p2', 'p3'],
      pools: {
        p1: { occ: ['A1'], minor: ['B1'] },
        p2: { occ: ['A2'], minor: ['B2'] },
        p3: { occ: ['A3'], minor: ['B3'] },
      },
      kept: {
        p1: { occ: [], minor: [] },
        p2: { occ: [], minor: [] },
        p3: { occ: [], minor: [] },
      },
      pendingPicks: {
        p1: { occ: 'A1', minor: 'B1' }, // full
        p2: { occ: 'A2', minor: null }, // half
        p3: { occ: null, minor: null }, // none
      },
    })
    expect(computeDraftViewModel(draft, 'p1').submittedCount).toBe(1)
  })
})

describe('canSubmitPick', () => {
  const baseVm: DraftViewModel = computeDraftViewModel(mkDraft(), 'p1')

  test('returns false when occ unselected', () => {
    expect(canSubmitPick(baseVm, null, 'B001')).toBe(false)
  })

  test('returns false when minor unselected', () => {
    expect(canSubmitPick(baseVm, 'A001', null)).toBe(false)
  })

  test('returns false when already submitted', () => {
    const submittedVm: DraftViewModel = computeDraftViewModel(
      mkDraft({
        pendingPicks: {
          p1: { occ: 'A001', minor: 'B001' },
          p2: { occ: null, minor: null },
        },
      }),
      'p1',
    )
    expect(canSubmitPick(submittedVm, 'A002', 'B002')).toBe(false)
  })

  test('returns true when both selected and in pool', () => {
    expect(canSubmitPick(baseVm, 'A001', 'B001')).toBe(true)
  })

  test('supports occupation-only and minor-only staged picks', () => {
    const occupationVm = computeDraftViewModel(mkDraft({ stage: 'occupation' }), 'p1')
    expect(canSubmitPick(occupationVm, 'A001', null)).toBe(true)
    expect(canSubmitPick(occupationVm, null, 'B001')).toBe(false)

    const minorVm = computeDraftViewModel(mkDraft({ stage: 'publishedMinor' }), 'p1')
    expect(canSubmitPick(minorVm, null, 'B001')).toBe(true)
    expect(canSubmitPick(minorVm, 'A001', null)).toBe(false)
  })

  test('rejects ids not present in the current pool (defensive)', () => {
    expect(canSubmitPick(baseVm, 'A999', 'B001')).toBe(false)
    expect(canSubmitPick(baseVm, 'A001', 'B999')).toBe(false)
  })
})
