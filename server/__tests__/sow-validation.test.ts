import { describe, expect, it } from 'vitest'
import { validateSowSelection } from '../../shared/domain/farmyard'
import type { PlayerFarmState } from '../../shared/domain/farmyard'

const createPlayer = (): PlayerFarmState => ({
  id: 'p1',
  name: 'P1',
  resources: {
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    food: 0,
    grain: 2,
    vegetable: 1,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
  },
  rooms: 2,
  houseType: 'wood',
  fields: [
    { stacks: [], row: 2, col: 1 },
    { stacks: [], row: 2, col: 2 },
  ],
  roomTiles: [
    { row: 2, col: 0 },
    { row: 1, col: 0 },
  ],
  stableTiles: [],
  fences: 0,
  fenceSegments: [],
  pastures: [],
})

describe('sow validation', () => {
  it('accepts mixed crops on empty fields', () => {
    const player = createPlayer()
    const result = validateSowSelection(player, [
      { row: 2, col: 1, crop: 'grain' },
      { row: 2, col: 2, crop: 'vegetable' },
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.player.resources.grain).toBe(1)
      expect(result.player.resources.vegetable).toBe(0)
    }
  })

  it('rejects sowing without seeds', () => {
    const player = createPlayer()
    player.resources.grain = 0
    const result = validateSowSelection(player, [
      { row: 2, col: 1, crop: 'grain' },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_ENOUGH_SEEDS')
    }
  })

  it('rejects non-empty field', () => {
    const player = createPlayer()
    player.fields[0].stacks = [{ kind: 'grain', remaining: 3 }]
    const result = validateSowSelection(player, [
      { row: 2, col: 1, crop: 'vegetable' },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_EMPTY')
    }
  })
})
