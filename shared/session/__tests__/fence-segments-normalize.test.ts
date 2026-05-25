import { describe, expect, it } from 'vitest'
import { createInitialState, normalizeState } from '../state-bootstrap'

describe('fenceSegments normalization', () => {
  it('normalizes current source-less own fence segment shape', () => {
    const base = createInitialState(1)
    ;(base.players[0] as unknown as { fenceSegments: unknown }).fenceSegments = [
      { edge: 'h:0:0', type: 'fence' },
    ]

    const normalized = normalizeState(base)

    expect(normalized.players[0].fenceSegments).toEqual([
      { edge: 'h:0:0', type: 'fence', source: { kind: 'own', ownerPlayerId: 'p1' } },
    ])
  })

  it('preserves borrowed fence segment source', () => {
    const base = createInitialState(1)
    ;(base.players[0] as unknown as { fenceSegments: unknown }).fenceSegments = [
      { edge: 'h:0:0', type: 'fence', source: { kind: 'borrowed', ownerPlayerId: 'p2' } },
    ]

    const normalized = normalizeState(base)

    expect(normalized.players[0].fenceSegments).toEqual([
      { edge: 'h:0:0', type: 'fence', source: { kind: 'borrowed', ownerPlayerId: 'p2' } },
    ])
  })

  it('sanitizes own fence segment source from another owner', () => {
    const base = createInitialState(1)
    ;(base.players[0] as unknown as { fenceSegments: unknown }).fenceSegments = [
      { edge: 'h:0:0', type: 'fence', source: { kind: 'own', ownerPlayerId: 'p2' } },
    ]

    const normalized = normalizeState(base)

    expect(normalized.players[0].fenceSegments).toEqual([
      { edge: 'h:0:0', type: 'fence', source: { kind: 'own', ownerPlayerId: 'p1' } },
    ])
  })
})
