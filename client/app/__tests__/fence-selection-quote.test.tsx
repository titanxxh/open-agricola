// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FenceSelectionQuote } from '../../../shared/contract/protocol/game'
import { useFenceSelectionQuote } from '../fence-selection-quote'

describe('the current fence selection quote', () => {
  it('ignores an old draft quote and hides a completed quote immediately when the snapshot changes', async () => {
    const replies: Array<(quote: FenceSelectionQuote) => void> = []
    const transport = { quoteFenceSelection: vi.fn(() => new Promise<FenceSelectionQuote>(resolve => replies.push(resolve))) }
    const snapshot = {}
    const request = { playerIndex: 0, requestKey: 'current-step', payload: { edges: ['H-0-1'] } }
    const { result, rerender } = renderHook(({ snapshot, request }) => useFenceSelectionQuote({ snapshot, request, transport }),
      { initialProps: { snapshot, request } })
    expect(result.current.kind).toBe('pending')
    rerender({ snapshot, request: { ...request, payload: { edges: ['H-0-1', 'H-1-1'] } } })
    await act(async () => { replies[0]!({ requestKey: 'current-step', woodCost: 1, valid: false, affordable: true, error: null }) })
    expect(result.current.kind).toBe('pending')
    await act(async () => { replies[1]!({ requestKey: 'current-step', woodCost: 2, valid: false, affordable: true, error: null }) })
    await waitFor(() => expect(result.current).toMatchObject({ kind: 'ready', quote: { woodCost: 2 } }))
    rerender({ snapshot: {}, request })
    expect(result.current.kind).toBe('pending')
  })
})
