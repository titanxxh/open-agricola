import { describe, expect, it } from 'vitest'
import { createInitialState, normalizeState } from '../state-bootstrap'

describe('legacy fenceSegments coercion', () => {
  it('coerces old string[] shape into own fence segments', () => {
    const base = createInitialState(1)
    ;(base.players[0] as unknown as { fenceSegments: unknown }).fenceSegments = [
      'h:2:0',
      'v:1:0',
    ]

    const normalized = normalizeState(base)

    expect(normalized.players[0].fenceSegments).toEqual([
      { edge: 'h:2:0', type: 'fence', source: { kind: 'own', ownerPlayerId: 'p1' } },
      { edge: 'v:1:0', type: 'fence', source: { kind: 'own', ownerPlayerId: 'p1' } },
    ])
  })

  it('coerces old object shape into own fence segments', () => {
    const base = createInitialState(1)
    base.players[0].fenceSegments = [
      { edge: 'h:0:0', type: 'fence' },
      { edge: 'v:0:0', type: 'palisade' },
    ]

    const normalized = normalizeState(base)

    expect(normalized.players[0].fenceSegments).toEqual([
      { edge: 'h:0:0', type: 'fence', source: { kind: 'own', ownerPlayerId: 'p1' } },
      { edge: 'v:0:0', type: 'palisade', source: { kind: 'own', ownerPlayerId: 'p1' } },
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
