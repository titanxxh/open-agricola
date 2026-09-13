import { describe, expect, it } from 'vitest'
import type { PlayerState } from '../../contract/types'
import { countTerrainAdjacencies } from '../terrain-adjacency'
import { makeBlankPlayer } from '../../domain/__tests__/helpers'

const makePlayer = (overrides: Partial<PlayerState>): PlayerState => ({
  ...makeBlankPlayer(),
  farmTerrain: [],
  ...overrides,
}) as PlayerState

describe('terrain fence adjacency', () => {
  it('counts adjacent terrain without fences', () => {
    const player = makePlayer({
      fields: [{ row: 0, col: 1, stacks: [] }],
      farmTerrain: [
        { row: 0, col: 0, kind: 'forest' },
        { row: 1, col: 0, kind: 'moor' },
      ],
    })

    expect(countTerrainAdjacencies(player)).toEqual({ forestField: 1, forestMoor: 1 })
  })

  it('counts a single fenced forest-field edge', () => {
    const player = makePlayer({
      fields: [{ row: 0, col: 1, stacks: [] }],
      farmTerrain: [{ row: 0, col: 0, kind: 'forest' }],
      fenceSegments: [{ edge: 'V-0-1', type: 'fence' }],
    })

    expect(countTerrainAdjacencies(player)).toEqual({ forestField: 1, forestMoor: 0 })
  })

  it('counts multiple fenced forest-field and forest-moor edges', () => {
    const player = makePlayer({
      fields: [
        { row: 0, col: 1, stacks: [] },
        { row: 2, col: 1, stacks: [] },
      ],
      farmTerrain: [
        { row: 0, col: 0, kind: 'forest' },
        { row: 1, col: 0, kind: 'moor' },
        { row: 1, col: 1, kind: 'forest' },
        { row: 1, col: 2, kind: 'moor' },
      ],
      fenceSegments: [
        { edge: 'V-0-1', type: 'fence' },
        { edge: 'H-1-0', type: 'fence' },
        { edge: 'H-2-1', type: 'fence' },
        { edge: 'V-1-2', type: 'fence' },
      ],
    })

    expect(countTerrainAdjacencies(player)).toEqual({ forestField: 3, forestMoor: 3 })
  })

  it('does not count duplicate fence segments twice', () => {
    const player = makePlayer({
      fields: [{ row: 0, col: 1, stacks: [] }],
      farmTerrain: [{ row: 0, col: 0, kind: 'forest' }],
      fenceSegments: [
        { edge: 'V-0-1', type: 'fence' },
        { edge: 'V-0-1', type: 'fence' },
      ],
    })

    expect(countTerrainAdjacencies(player)).toEqual({ forestField: 1, forestMoor: 0 })
  })
})
