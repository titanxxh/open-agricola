import { expect, it } from 'vitest'
import { initDraftState, initStagedDraftState, processSubmit } from '../../../../shared/draft/draft-manager'
import { firstDraftPick } from '../../../../shared/draft/__tests__/draft-fixtures'
import { canSubmitPick, computeDraftViewModel } from '../DraftOverlay'

const initial = () => initDraftState(['p1', 'p2'], {
  p1: { occ: ['o1', 'o2', 'o3'], minor: ['m1', 'm2', 'm3'] },
  p2: { occ: ['o4', 'o5', 'o6'], minor: ['m4', 'm5', 'm6'] },
}, 3, 2)

it('allows only complete choices from the current packet', () => {
  const vm = computeDraftViewModel(initial(), 'p1')
  expect(canSubmitPick(vm, 'o1', 'm1')).toBe(true)
  expect(canSubmitPick(vm, 'o1', null)).toBe(false)
  expect(canSubmitPick(vm, null, 'm1')).toBe(false)
  expect(canSubmitPick(vm, 'o4', 'm1')).toBe(false)
})

it('distinguishes waiting for a packet from actionable players', () => {
  const draft = initial()
  const result = processSubmit(draft, 'p1', firstDraftPick(draft, 'p1'))
  if (result.kind !== 'accepted') throw new Error(result.error)
  const vm = computeDraftViewModel(result.draft, 'p1')
  expect(vm.progress.kind).toBe('waiting')
  expect(vm.waitingPlayerIds).toEqual(['p2'])
  expect(vm.myKept).toEqual({ occ: ['o1'], minor: ['m1'] })
  expect(canSubmitPick(vm, 'o2', 'm2')).toBe(false)
})

it.each(['occupation', 'publishedMinor', 'farmersOfTheMoorMinor'] as const)('accepts only the required card type in %s', kind => {
  const draft = initStagedDraftState(['p1'], [{ kind, poolSize: 2, totalRounds: 2,
    pools: { p1: { occ: kind === 'occupation' ? ['o1', 'o2'] : [], minor: kind !== 'occupation' ? ['m1', 'm2'] : [] } } }])
  const vm = computeDraftViewModel(draft, 'p1')
  expect(canSubmitPick(vm, kind === 'occupation' ? 'o1' : null, kind === 'occupation' ? null : 'm1')).toBe(true)
})
