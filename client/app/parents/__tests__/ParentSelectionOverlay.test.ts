import { describe, expect, test } from 'vitest'
import {
  canSubmitParentSelection,
  computeParentSelectionViewModel,
  type ParentSelectionViewModel,
} from '../ParentSelectionOverlay'
import type { ParentSelectionState } from '../../../../shared/contract/types'

const mkParentSelection = (overrides: Partial<ParentSelectionState> = {}): ParentSelectionState => ({
  candidates: {
    p1: { mother: ['PR01', 'PR02'], father: ['PS01', 'PS02'] },
    p2: { mother: ['PR03', 'PR04'], father: ['PS03', 'PS04'] },
  },
  submissions: {
    p1: null,
    p2: null,
  },
  ...overrides,
})

describe('computeParentSelectionViewModel', () => {
  test('extracts local candidates and submitted count', () => {
    const vm = computeParentSelectionViewModel(mkParentSelection(), 'p1')
    expect(vm.seatCount).toBe(2)
    expect(vm.submittedCount).toBe(0)
    expect(vm.myCandidates.mother).toEqual(['PR01', 'PR02'])
    expect(vm.myCandidates.father).toEqual(['PS01', 'PS02'])
    expect(vm.alreadySubmitted).toBe(false)
    expect(vm.canSeeCandidates).toBe(true)
  })

  test('treats masked candidates as waiting-only view', () => {
    const vm = computeParentSelectionViewModel({
      candidates: {
        p1: { mother: ['?', '?'] as never, father: ['?', '?'] as never },
        p2: { mother: ['?', '?'] as never, father: ['?', '?'] as never },
      },
      submissions: {
        p1: null,
        p2: { mother: '?', father: '?' } as never,
      },
    }, 'p1')
    expect(vm.canSeeCandidates).toBe(false)
    expect(vm.submittedCount).toBe(1)
  })
})

describe('canSubmitParentSelection', () => {
  const baseVm: ParentSelectionViewModel = computeParentSelectionViewModel(mkParentSelection(), 'p1')

  test('requires one mother and one father from visible candidates', () => {
    expect(canSubmitParentSelection(baseVm, null, 'PS01')).toBe(false)
    expect(canSubmitParentSelection(baseVm, 'PR01', null)).toBe(false)
    expect(canSubmitParentSelection(baseVm, 'PR03', 'PS01')).toBe(false)
    expect(canSubmitParentSelection(baseVm, 'PR01', 'PS03')).toBe(false)
    expect(canSubmitParentSelection(baseVm, 'PR01', 'PS01')).toBe(true)
  })

  test('blocks resubmission', () => {
    const vm = computeParentSelectionViewModel(mkParentSelection({
      submissions: {
        p1: { mother: 'PR01', father: 'PS01' },
        p2: null,
      },
    }), 'p1')
    expect(canSubmitParentSelection(vm, 'PR02', 'PS02')).toBe(false)
  })
})
