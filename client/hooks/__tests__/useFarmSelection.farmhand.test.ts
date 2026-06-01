// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useFarmSelection } from '../useFarmSelection'
import type { FarmTilePosition } from '../../../shared/contract/types'

const positionKey = (t: FarmTilePosition) => `${t.row}-${t.col}`

describe('useFarmSelection — B85 farmHand selection', () => {
  it('starts with no pending farmHand', () => {
    const { result } = renderHook(() => useFarmSelection())
    expect(result.current.pendingFarmHand).toBeNull()
  })

  it('selects a farmHand candidate on click', () => {
    const { result } = renderHook(() => useFarmSelection())
    act(() => {
      result.current.toggleFarmHand({ row: 1, col: 1 }, positionKey)
    })
    expect(result.current.pendingFarmHand).toEqual({ row: 1, col: 1 })
  })

  it('clicking the same farmHand candidate again cancels it', () => {
    const { result } = renderHook(() => useFarmSelection())
    act(() => {
      result.current.toggleFarmHand({ row: 1, col: 1 }, positionKey)
    })
    act(() => {
      result.current.toggleFarmHand({ row: 1, col: 1 }, positionKey)
    })
    expect(result.current.pendingFarmHand).toBeNull()
  })

  it('selecting a different farmHand candidate replaces the previous one (max 1)', () => {
    const { result } = renderHook(() => useFarmSelection())
    act(() => {
      result.current.toggleFarmHand({ row: 1, col: 1 }, positionKey)
    })
    act(() => {
      result.current.toggleFarmHand({ row: 2, col: 2 }, positionKey)
    })
    expect(result.current.pendingFarmHand).toEqual({ row: 2, col: 2 })
  })

  it('farmHand and normal stable selections coexist', () => {
    const { result } = renderHook(() => useFarmSelection())
    act(() => {
      result.current.toggleStableTile({ row: 0, col: 0 }, 2, positionKey)
    })
    act(() => {
      result.current.toggleFarmHand({ row: 1, col: 1 }, positionKey)
    })
    expect(result.current.pendingStableTiles).toEqual([{ row: 0, col: 0 }])
    expect(result.current.pendingFarmHand).toEqual({ row: 1, col: 1 })
  })
})

describe('useFarmSelection — borrowed fence sources', () => {
  it('stores a donor source per pending ordinary fence edge', () => {
    const { result } = renderHook(() => useFarmSelection())

    act(() => {
      result.current.setSelectedFenceSourcePlayerId('p2')
    })
    act(() => {
      result.current.toggleFenceEdge('H-0-0', { donorCaps: { p2: 2, p3: 2 } })
    })
    act(() => {
      result.current.setSelectedFenceSourcePlayerId('p3')
    })
    act(() => {
      result.current.toggleFenceEdge('V-0-0', { donorCaps: { p2: 2, p3: 2 } })
    })

    expect(result.current.pendingFenceEdges).toEqual(['H-0-0', 'V-0-0'])
    expect(result.current.pendingFenceSources).toEqual({
      'H-0-0': 'p2',
      'V-0-0': 'p3',
    })
  })

  it('removes a pending edge source when that edge is deselected', () => {
    const { result } = renderHook(() => useFarmSelection())

    act(() => {
      result.current.setSelectedFenceSourcePlayerId('p2')
    })
    act(() => {
      result.current.toggleFenceEdge('H-0-0', { donorCaps: { p2: 1 } })
    })
    act(() => {
      result.current.toggleFenceEdge('H-0-0', { donorCaps: { p2: 1 } })
    })

    expect(result.current.pendingFenceEdges).toEqual([])
    expect(result.current.pendingFenceSources).toEqual({})
  })

  it('prevents assigning more pending edges than the selected donor cap', () => {
    const { result } = renderHook(() => useFarmSelection())

    act(() => {
      result.current.setSelectedFenceSourcePlayerId('p2')
    })
    act(() => {
      result.current.toggleFenceEdge('H-0-0', { donorCaps: { p2: 1 } })
    })
    act(() => {
      result.current.toggleFenceEdge('V-0-0', { donorCaps: { p2: 1 } })
    })

    expect(result.current.pendingFenceEdges).toEqual(['H-0-0'])
    expect(result.current.pendingFenceSources).toEqual({ 'H-0-0': 'p2' })
  })

  it('does not assign a stale selected donor when the current fence action has no borrowed source caps', () => {
    const { result } = renderHook(() => useFarmSelection())

    act(() => {
      result.current.setSelectedFenceSourcePlayerId('p2')
    })
    act(() => {
      result.current.toggleFenceEdge('H-0-0')
    })

    expect(result.current.pendingFenceEdges).toEqual(['H-0-0'])
    expect(result.current.pendingFenceSources).toEqual({})
  })
})
