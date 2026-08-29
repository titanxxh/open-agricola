import { describe, expect, it } from 'vitest'
import { authoritativeCommandKey } from '../authoritative-command'

describe('authoritativeCommandKey', () => {
  it('normalizes set-valued commit selections without reordering other arrays', () => {
    const first = {
      edges: ['b', 'a'],
      palisadeEdges: ['d', 'c'],
      positions: [{ row: 1, col: 0 }, { row: 0, col: 1 }],
      rooms: [{ row: 2, col: 0 }, { row: 1, col: 1 }],
      stables: [{ row: 0, col: 2 }, { row: 0, col: 0 }],
      cardIds: ['D002', 'A001'],
      crops: [
        { row: 1, col: 0, crop: 'grain' },
        { row: 0, col: 1, crop: 'vegetable' },
      ],
    }
    const reversed = Object.fromEntries(Object.entries(first).map(([key, value]) => [
      key,
      [...value].reverse(),
    ]))

    expect(authoritativeCommandKey('commitSelection', 0, first))
      .toBe(authoritativeCommandKey('commitSelection', 0, reversed))
    expect(authoritativeCommandKey('choice', 0, { selections: ['b', 'a'] }))
      .not.toBe(authoritativeCommandKey('choice', 0, { selections: ['a', 'b'] }))
  })
})
