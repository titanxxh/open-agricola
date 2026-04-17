import { describe, expect, it } from 'vitest'
import { validateFenceSelection } from '../fence-validation.ts'
import type { PlayerFarmState } from '../fence-validation.ts'

const createPlayer = (): PlayerFarmState => ({
  id: 'p1',
  name: 'P1',
  resources: {
    wood: 20,
    clay: 0,
    reed: 0,
    stone: 0,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
  },
  rooms: 2,
  houseType: 'wood',
  fields: [],
  roomTiles: [
    { row: 2, col: 0 },
    { row: 1, col: 0 },
  ],
  stableTiles: [],
  fenceSegments: [],
  pastures: [],
})

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

describe('fence validation', () => {
  it('accepts a closed square', () => {
    const player = createPlayer()
    const result = validateFenceSelection(player, edgesForTile(1, 1))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.player.fenceSegments.length).toBe(4)
      expect(result.newPastures).toHaveLength(1)
      expect(result.newPastures[0]?.tiles).toHaveLength(1)
    }
  })

  it('rejects an open shape', () => {
    const player = createPlayer()
    const edges = edgesForTile(1, 1).slice(0, 3)
    const result = validateFenceSelection(player, edges)
    expect(result.ok).toBe(false)
  })

  it('rejects enclosing rooms', () => {
    const player = createPlayer()
    const result = validateFenceSelection(player, edgesForTile(2, 0))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('ENCLOSED_TILE_OCCUPIED')
    }
  })

  it('requires connection to existing fences', () => {
    const player = createPlayer()
    player.fenceSegments = [{ edge: 'H-0-0', type: 'fence' }]
    const result = validateFenceSelection(player, edgesForTile(1, 3))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('FENCE_NOT_CONNECTED')
    }
  })
})
