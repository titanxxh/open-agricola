// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useFarmSelection } from '../useFarmSelection'
import type { FarmTilePosition } from '../../../shared/contract/types'

const positionKey = (t: FarmTilePosition) => `${t.row}-${t.col}`

describe('useFarmSelection updateSowSelection group counting', () => {
  it('allows 2 D75 slots when maxSelections=1 (same groupKey)', () => {
    const { result } = renderHook(() => useFarmSelection())
    const groupKeyByTile = new Map<string, string | undefined>([
      ['-75-0', 'D075_WoodField'],
      ['-75-1', 'D075_WoodField'],
    ])
    act(() => {
      result.current.updateSowSelection(
        { row: -75, col: 0 },
        'wood',
        1,
        positionKey,
        groupKeyByTile,
      )
    })
    act(() => {
      result.current.updateSowSelection(
        { row: -75, col: 1 },
        'wood',
        1,
        positionKey,
        groupKeyByTile,
      )
    })
    expect(Object.keys(result.current.pendingSowSelections)).toHaveLength(2)
  })

  it('rejects normal field after picking D75 slot when maxSelections=1', () => {
    const { result } = renderHook(() => useFarmSelection())
    const groupKeyByTile = new Map<string, string | undefined>([
      ['-75-0', 'D075_WoodField'],
      ['0-0', undefined],
    ])
    act(() => {
      result.current.updateSowSelection(
        { row: -75, col: 0 },
        'wood',
        1,
        positionKey,
        groupKeyByTile,
      )
    })
    act(() => {
      result.current.updateSowSelection(
        { row: 0, col: 0 },
        'grain',
        1,
        positionKey,
        groupKeyByTile,
      )
    })
    expect(Object.keys(result.current.pendingSowSelections)).toEqual(['-75-0'])
  })

  it('accepts stone as a valid sow value', () => {
    const { result } = renderHook(() => useFarmSelection())
    act(() => {
      result.current.updateSowSelection(
        { row: -80, col: 0 },
        'stone',
        undefined,
        positionKey,
        new Map(),
      )
    })
    expect(result.current.pendingSowSelections['-80-0']).toBe('stone')
  })
})
