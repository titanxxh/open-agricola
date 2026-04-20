import { describe, expect, it } from 'vitest'
import { validatePlowSelection } from '../../shared/logic/farm/plow-validation.ts'
import type { PlayerFarmState } from '../../shared/logic/farm/fence-validation.ts'

const createPlayer = (): PlayerFarmState => ({
  id: 'p1',
  name: 'P1',
  resources: {
    wood: 0,
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
  fields: [{ crop: null, remaining: 0, row: 2, col: 1 }],
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

describe('plow validation', () => {
  it('accepts adjacent empty tile', () => {
    const player = createPlayer()
    const result = validatePlowSelection(player, { row: 2, col: 2 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.player.fields.length).toBe(2)
    }
  })

  it('accepts any empty tile as first field', () => {
    const player = createPlayer()
    player.fields = []
    const result = validatePlowSelection(player, { row: 0, col: 1 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.player.fields.length).toBe(1)
    }
  })

  it('rejects non-adjacent tile', () => {
    const player = createPlayer()
    const result = validatePlowSelection(player, { row: 0, col: 4 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_ADJACENT')
    }
  })

  it('rejects fenced tile', () => {
    const player = createPlayer()
    player.fenceSegments = edgesForTile(1, 1).map((edge) => ({ edge, type: 'fence' }))
    const result = validatePlowSelection(player, { row: 1, col: 1 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('FENCED')
    }
  })

  it('rejects occupied tile', () => {
    const player = createPlayer()
    const result = validatePlowSelection(player, { row: 2, col: 0 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('OCCUPIED')
    }
  })
})
