import { describe, expect, it } from 'vitest'

import type { PlayerState } from '../../contract/types'
import {
  buildTerrainSelectionLeaf,
  getMoorToFieldTiles,
  getTerrainTiles,
  getUnusedTerrainTiles,
} from '../terrain-flow'
import { selectionAction } from '../../actions/effects/internal/selection'
import { makeBlankPlayer } from '../../domain/__tests__/helpers'

const makePlayer = (): PlayerState => ({
  ...makeBlankPlayer(),
  roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
  farmTerrain: [
    { row: 1, col: 0, kind: 'forest' },
    { row: 1, col: 1, kind: 'moor' },
    { row: 2, col: 4, kind: 'moor' },
  ],
  fields: [{ row: 1, col: 2, stacks: [] }],
  stableTiles: [{ row: 2, col: 0 }],
}) as PlayerState

describe('single-layer terrain flow primitives', () => {
  it('selects only unused farmyard spaces for placing terrain', () => {
    expect(getUnusedTerrainTiles(makePlayer())).toEqual([
      { row: 0, col: 2 },
      { row: 0, col: 3 },
      { row: 0, col: 4 },
      { row: 1, col: 3 },
      { row: 1, col: 4 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
    ])
  })

  it('rejects occupied positions before terrain effects run', () => {
    const player = makePlayer()
    const leaf = buildTerrainSelectionLeaf({
      sourceCard: 'TEST',
      mode: 'place',
      kind: 'forest',
      selectableTiles: getUnusedTerrainTiles(player),
    })

    const result = selectionAction.resolveChoice!(
      { state: { players: [player] }, player, sourceCard: 'TEST', actionContext: leaf.actionContext } as never,
      'confirm',
      { positions: ['0-0'] },
    )

    expect(result).toEqual({
      type: 'fail',
      errorKey: 'invalid selection position',
      recoverable: true,
    })
    expect(getTerrainTiles(player, 'forest')).toEqual([{ row: 1, col: 0 }])
  })

  it('skips optional terrain placement without changing farmTerrain', () => {
    const player = makePlayer()
    const before = [...player.farmTerrain!]
    const leaf = buildTerrainSelectionLeaf({
      sourceCard: 'TEST',
      mode: 'place',
      kind: 'moor',
      selectableTiles: getUnusedTerrainTiles(player),
      optional: true,
    })

    const result = selectionAction.resolveChoice!(
      { state: { players: [player] }, player, sourceCard: 'TEST', actionContext: leaf.actionContext } as never,
      'confirm',
      { positions: [] },
    )

    expect(result.type).toBe('ok')
    expect(player.farmTerrain).toEqual(before)
  })

  it('limits moor-to-field replacement to moors adjacent to existing fields', () => {
    expect(getMoorToFieldTiles(makePlayer())).toEqual([{ row: 1, col: 1 }])
  })
})
