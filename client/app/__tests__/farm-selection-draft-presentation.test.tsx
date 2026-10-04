// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { emptyResources } from '../../../shared/contract/state-constants'
import type { PlayerState } from '../../../shared/contract/types'
import type { InteractionPresentationPlan } from '../interaction-presentation'
import { useFarmSelectionDraftPresentation } from '../farm-selection-draft-presentation'

const player = (id: string, name = id, color: PlayerState['color'] = 'red'): Pick<PlayerState, 'id' | 'name' | 'color' | 'resources'> => ({
  id,
  name,
  color,
  resources: { ...emptyResources, grain: 2, vegetable: 1, wood: 1, stone: 1 },
})

const pendingChoice = {
  playerIndex: 0,
  spaceId: 'test',
  options: [{ value: 'confirm', labelKey: 'ui.interactionConfirmButton' }],
}

describe('useFarmSelectionDraftPresentation', () => {
  it('localizes generated fence donors and updates them when the language changes', () => {
    const plan: InteractionPresentationPlan = { kind: 'farm-fence-selection', pendingChoice,
      farm: { farmType: 'fence', selectableEdges: ['H-0-0'],
        fenceSource: { kind: 'borrowed', donorCaps: { p1: 1, p2: 1 } } } }
    const { result, rerender } = renderHook(({ locale }: { locale: 'zh' | 'en' }) =>
      useFarmSelectionDraftPresentation({ interactionPresentationPlan: plan, locale,
        players: [player('p1', 'Player 2'), { ...player('p2', 'Player 2'), nameIsDefault: true }] }),
    { initialProps: { locale: 'zh' } })
    expect(result.current.borrowedFenceSources?.donors.map((donor) => donor.name)).toEqual(['Player 2', '玩家 2'])
    rerender({ locale: 'en' })
    expect(result.current.borrowedFenceSources?.donors.map((donor) => donor.name)).toEqual(['Player 2', 'Player 2'])
  })
  it('owns farm draft controls, submit draft, local errors, borrowed fence donors, and reset', () => {
    const roomPlan: InteractionPresentationPlan = {
      kind: 'farm-room-selection',
      pendingChoice,
      farm: {
        farmType: 'room',
        selectableTiles: [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
          { row: 0, col: 2 },
        ],
        maxSelections: 2,
      },
    }
    const { result, rerender } = renderHook(
      ({ plan }) =>
        useFarmSelectionDraftPresentation({
          interactionPresentationPlan: plan,
          locale: 'en',
          displayPlayer: player('p1'),
          players: [player('p1'), player('p2', 'Donor', 'blue')],
        }),
      { initialProps: { plan: roomPlan } },
    )

    act(() => result.current.controls.toggleRoomTile({ row: 0, col: 0 }))
    act(() => result.current.controls.toggleRoomTile({ row: 0, col: 1 }))
    act(() => result.current.controls.toggleRoomTile({ row: 0, col: 2 }))
    expect(result.current.submitDraft.roomTiles).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ])
    expect(result.current.interactionBarDraft.pendingRoomTilesLength).toBe(2)
    expect(result.current.projectionDraft.pendingRoomTiles).toEqual(result.current.submitDraft.roomTiles)

    act(() => result.current.setSubmitError('room', 'NO_SELECTION'))
    expect(result.current.interactionBarDraft.roomErrorText).toBe('Select at least one empty tile')

    act(() => {
      rerender({
        plan: {
          kind: 'farm-fence-selection',
          pendingChoice,
          farm: {
            farmType: 'fence',
            selectableEdges: ['H-0-0', 'V-0-0'],
            fenceSource: { kind: 'borrowed', donorCaps: { p2: 1 } },
          },
        },
      })
    })
    act(() => result.current.controls.setSelectedFenceSourcePlayerId('p2'))
    act(() => result.current.controls.toggleFenceEdge('H-0-0'))
    act(() => result.current.controls.toggleFenceEdge('V-0-0'))
    expect(result.current.submitDraft.fenceEdges).toEqual(['H-0-0'])
    expect(result.current.submitDraft.fenceSources).toEqual({ 'H-0-0': 'p2' })
    expect(result.current.borrowedFenceSources?.donors).toEqual([
      {
        playerId: 'p2',
        name: 'Donor',
        color: 'blue',
        cap: 1,
        allocated: 1,
      },
    ])

    act(() => {
      rerender({
        plan: {
          kind: 'farm-sow-selection',
          pendingChoice,
          farm: {
            farmType: 'sow',
            maxSelections: 1,
            selectableFields: [
              { tile: { row: -75, col: 0 }, allowedCrops: ['wood'], groupKey: 'D075_WoodField' },
              { tile: { row: -75, col: 1 }, allowedCrops: ['wood'], groupKey: 'D075_WoodField' },
              { tile: { row: 0, col: 0 }, allowedCrops: ['grain'] },
            ],
          },
        },
      })
    })
    act(() => result.current.controls.updateSowSelection({ row: -75, col: 0 }, 'wood'))
    act(() => result.current.controls.updateSowSelection({ row: -75, col: 1 }, 'wood'))
    act(() => result.current.controls.updateSowSelection({ row: 0, col: 0 }, 'grain'))
    expect(result.current.submitDraft.sowSelections).toEqual({
      '-75-0': 'wood',
      '-75-1': 'wood',
    })
    expect(result.current.farmBoardDraft.sowRemaining.wood).toBe(0)
    expect(result.current.interactionBarDraft.pendingSowSelectionsLength).toBe(2)

    act(() => {
      rerender({
        plan: {
          kind: 'position-selection',
          pendingChoice,
          selection: {
            kind: 'farm-position',
            selectablePositions: [
              { row: 1, col: 0 },
              { row: 1, col: 1 },
            ],
            maxSelections: 1,
          },
        },
      })
    })
    act(() => result.current.controls.togglePositionSelection({ row: 1, col: 0 }))
    act(() => result.current.controls.togglePositionSelection({ row: 1, col: 1 }))
    expect(result.current.submitDraft.positionSelectionKeys).toEqual(['1-0'])
    expect(result.current.interactionBarDraft.pendingPositionSelectionsLength).toBe(1)

    act(() => {
      result.current.reset()
      rerender({
        plan: {
          kind: 'position-selection',
          pendingChoice,
          selection: {
            kind: 'farm-position',
            selectablePositions: [
              { row: -1, col: 4075, groupKey: 'D075_WoodField' },
              { row: -1, col: 4076, groupKey: 'D075_WoodField' },
            ],
            maxSelections: 1,
          },
        },
      })
    })
    act(() => result.current.controls.togglePositionSelection({ row: -1, col: 4075 }))
    act(() => result.current.controls.togglePositionSelection({ row: -1, col: 4076 }))
    expect(result.current.submitDraft.positionSelectionKeys).toEqual(['-1-4076'])

    act(() => result.current.reset())
    expect(result.current.submitDraft).toEqual({
      positionSelectionKeys: [],
      fenceEdges: [],
      palisadeEdges: [],
      fenceSources: {},
      roomTiles: [],
      stableTiles: [],
      farmHand: null,
      plowTile: null,
      sowSelections: {},
    })
  })
})
