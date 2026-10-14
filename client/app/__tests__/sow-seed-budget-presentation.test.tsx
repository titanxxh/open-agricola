// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { emptyResources } from '../../../shared/contract/state-constants'
import type { InteractionPresentationPlan } from '../interaction-presentation'
import { useFarmSelectionDraftPresentation } from '../farm-selection-draft-presentation'

it('a server seed budget limits slots without changing the logical-field group cap', () => {
  const plan: InteractionPresentationPlan = {
    kind: 'farm-sow-selection',
    pendingChoice: { playerIndex: 0, spaceId: 'grain-utilization', options: [{ value: 'confirm', labelKey: 'ui.interactionConfirmButton' }] },
    farm: {
      farmType: 'sow', maxSelections: 1, maxSeedSelections: 1,
      selectableFields: [
        { tile: { row: -1, col: 4075 }, allowedCrops: ['wood'], groupKey: 'D075_WoodField' },
        { tile: { row: -1, col: 4076 }, allowedCrops: ['wood'], groupKey: 'D075_WoodField' },
      ],
    },
  }
  const player = { id: 'p1', name: 'Player 1', color: 'red' as const, resources: { ...emptyResources, wood: 2 } }
  const { result } = renderHook(() => useFarmSelectionDraftPresentation({ interactionPresentationPlan: plan, locale: 'en', displayPlayer: player, players: [player] }))
  act(() => result.current.controls.updateSowSelection({ row: -1, col: 4075 }, 'wood'))
  act(() => result.current.controls.updateSowSelection({ row: -1, col: 4076 }, 'wood'))
  expect(result.current.submitDraft.sowSelections).toEqual({ '-1-4075': 'wood' })
  expect(result.current.farmBoardDraft.sowRemaining.wood).toBe(1)
  act(() => result.current.controls.updateSowSelection({ row: -1, col: 4075 }, ''))
  act(() => result.current.controls.updateSowSelection({ row: -1, col: 4076 }, 'wood'))
  expect(result.current.submitDraft.sowSelections).toEqual({ '-1-4076': 'wood' })
})
