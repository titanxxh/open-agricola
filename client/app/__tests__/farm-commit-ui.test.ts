import { describe, expect, it } from 'vitest'

import { buildFenceCommitPayload, buildStableCommitPayload } from '../farm-commit-ui'

describe('buildStableCommitPayload', () => {
  it('returns null when neither stables nor farmHand are selected', () => {
    expect(buildStableCommitPayload([], null)).toBeNull()
  })

  it('submits only stables when no farmHand is selected', () => {
    expect(
      buildStableCommitPayload([{ row: 0, col: 0 }], null),
    ).toEqual({ stables: [{ row: 0, col: 0 }], farmHand: undefined })
  })

  it('submits only farmHand when no normal stable is selected (B85)', () => {
    expect(
      buildStableCommitPayload([], { row: 1, col: 1 }),
    ).toEqual({ stables: [], farmHand: { row: 1, col: 1 } })
  })

  it('submits both stables and farmHand for a mixed selection', () => {
    expect(
      buildStableCommitPayload([{ row: 0, col: 0 }], { row: 1, col: 1 }),
    ).toEqual({
      stables: [{ row: 0, col: 0 }],
      farmHand: { row: 1, col: 1 },
    })
  })
})

describe('buildFenceCommitPayload', () => {
  it('submits own fence geometry without client-controlled costs', () => {
    expect(
      buildFenceCommitPayload(
        ['H-0-0'],
        ['V-0-0'],
        undefined,
        { 'H-0-0': 'p2' },
      ),
    ).toEqual({
      edges: ['H-0-0'],
      palisadeEdges: ['V-0-0'],
    })
  })

  it('submits per-edge borrowed fence sources for borrowed fence policy', () => {
    expect(
      buildFenceCommitPayload(
        ['H-0-0', 'V-0-0'],
        [],
        { kind: 'borrowed', donorCaps: { p2: 2, p3: 1 } },
        { 'H-0-0': 'p2', 'V-0-0': 'p3' },
      ),
    ).toEqual({
      edges: ['H-0-0', 'V-0-0'],
      palisadeEdges: [],
      fenceSources: { 'H-0-0': 'p2', 'V-0-0': 'p3' },
    })
  })
})
