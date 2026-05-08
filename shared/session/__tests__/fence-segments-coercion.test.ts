import { describe, expect, it } from 'vitest'
import { createInitialState, normalizeState } from '../state-bootstrap'

describe('legacy fenceSegments coercion', () => {
  it('coerces old string[] shape into FenceSegment[] with type "fence"', () => {
    const base = createInitialState(1)
    // Simulate old-shape persisted save where fenceSegments was string[]
    ;(base.players[0] as unknown as { fenceSegments: unknown }).fenceSegments = [
      'h:2:0',
      'v:1:0',
    ]

    const normalized = normalizeState(base)

    expect(normalized.players[0].fenceSegments).toEqual([
      { edge: 'h:2:0', type: 'fence' },
      { edge: 'v:1:0', type: 'fence' },
    ])
  })

  it('preserves already-normalized FenceSegment[] entries', () => {
    const base = createInitialState(1)
    base.players[0].fenceSegments = [
      { edge: 'h:0:0', type: 'fence' },
      { edge: 'v:0:0', type: 'palisade' },
    ]

    const normalized = normalizeState(base)

    expect(normalized.players[0].fenceSegments).toEqual([
      { edge: 'h:0:0', type: 'fence' },
      { edge: 'v:0:0', type: 'palisade' },
    ])
  })
})
