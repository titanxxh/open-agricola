import { describe, expect, it } from 'vitest'
import { parseCommitSelectionPayload } from '../protocol/commit-selection'

describe('parseCommitSelectionPayload', () => {
  it('accepts every client selection shape and drops undefined fields', () => {
    expect(parseCommitSelectionPayload({ stables: [{ row: 0, col: 2 }], farmHand: { row: 1, col: 3 } }))
      .toEqual({ stables: [{ row: 0, col: 2 }], farmHand: { row: 1, col: 3 } })
    expect(parseCommitSelectionPayload({ stables: [{ row: 0, col: 2 }], farmHand: undefined }))
      .toEqual({ stables: [{ row: 0, col: 2 }] })
    expect(parseCommitSelectionPayload({ edges: ['H-0-0'], palisadeEdges: [], fenceSources: { 'H-0-0': 'p2' } }))
      .toEqual({ edges: ['H-0-0'], palisadeEdges: [], fenceSources: { 'H-0-0': 'p2' } })
  })

  it.each([
    [null],
    [{}],
    [{ farmHand: undefined }],
    [{ edges: ['H-0-0'], extraWood: 0 }],
    [{ cancel: false }],
    [{ farmHand: { row: '1', col: 3 } }],
    [{ edges: ['x'.repeat(33)] }],
  ])('rejects %j', (payload) => {
    expect(() => parseCommitSelectionPayload(payload)).toThrow('invalid payload')
  })
})
