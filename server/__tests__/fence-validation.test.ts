import { describe, expect, it } from 'vitest'
import { validateFenceSelection } from '../fence-validation.ts'
import type { PlayerFarmState } from '../fence-validation.ts'
import {
  getFenceCount,
  getPalisadeCount,
} from '../../shared/actions/effects/fencing.ts'

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

  it('rejects palisades without allowPalisades option', () => {
    const player = createPlayer()
    const result = validateFenceSelection(player, [], ['H-0-0'], 0, 0, {})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('PALISADES_NOT_UNLOCKED')
    }
  })

  it('accepts palisades only when allowPalisades is set', () => {
    const player = createPlayer()
    const result = validateFenceSelection(
      player,
      ['H-1-0', 'V-0-0', 'V-0-1'],
      ['H-0-0'],
      0,
      0,
      { allowPalisades: true },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.newPalisadeEdges).toEqual(['H-0-0'])
      expect(result.newFenceEdges.sort()).toEqual(['H-1-0', 'V-0-0', 'V-0-1'])
    }
  })
})

describe('validateFenceSelection — palisade support', () => {
  it('charges 2 wood per palisade segment', () => {
    const player = createPlayer()
    player.resources.wood = 10
    const palisadeEdges = edgesForTile(0, 0)
    const result = validateFenceSelection(player, [], palisadeEdges, 0, 0, {
      allowPalisades: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payableWoodCost).toBe(8)
      expect(result.newPalisadeEdges).toEqual(palisadeEdges)
      expect(result.newFenceEdges).toEqual([])
    }
  })

  it('freeFences only discounts fence segments, not palisades', () => {
    const player = createPlayer()
    player.resources.wood = 10
    const result = validateFenceSelection(
      player,
      ['H-0-0', 'V-0-0'],
      ['H-1-0', 'V-0-1'],
      0,
      2,
      { allowPalisades: true },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      // 2 fences - 2 freeFences = 0 + 2 palisades * 2 = 4
      expect(result.payableWoodCost).toBe(4)
    }
  })

  it('rejects edge appearing in both fence and palisade arrays with EDGE_TYPE_CONFLICT', () => {
    const player = createPlayer()
    const result = validateFenceSelection(
      player,
      ['H-0-0'],
      ['H-0-0'],
      0,
      0,
      { allowPalisades: true },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('EDGE_TYPE_CONFLICT')
    }
  })

  it('palisade-only enclosure forms a pasture', () => {
    const player = createPlayer()
    player.resources.wood = 10
    const palisadeEdges = edgesForTile(0, 0)
    const result = validateFenceSelection(player, [], palisadeEdges, 0, 0, {
      allowPalisades: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.newPastures).toHaveLength(1)
      expect(result.newPastures[0]?.tiles).toHaveLength(1)
      expect(getFenceCount(result.player)).toBe(0)
      expect(getPalisadeCount(result.player)).toBe(4)
    }
  })

  it('mixed fence + palisade segments enclose a pasture together', () => {
    const player = createPlayer()
    player.resources.wood = 10
    const result = validateFenceSelection(
      player,
      ['H-0-0', 'V-0-0'],
      ['H-1-0', 'V-0-1'],
      0,
      0,
      { allowPalisades: true },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.newPastures).toHaveLength(1)
      expect(getFenceCount(result.player)).toBe(2)
      expect(getPalisadeCount(result.player)).toBe(2)
    }
  })

  it('palisade segments do not count toward MAX_FENCES limit', () => {
    // Pre-load 13 fence segments. Choose edges that:
    //  - do not conflict with the new edges around tile (0,0)
    //  - do not, together with the new edges, enclose any room tile
    //    (rooms are at (2,0) and (1,0); we leave V-2-0 off so tile (2,0)
    //     leaks left and the non-(0,0) region stays unfenced)
    //  - share at least one vertex with the new edges so connectivity passes
    const preloadedEdges = [
      'V-1-0',
      'H-0-1',
      'H-0-2',
      'H-0-3',
      'H-0-4',
      'H-3-0',
      'H-3-1',
      'H-3-2',
      'H-3-3',
      'H-3-4',
      'V-0-5',
      'V-1-5',
      'V-2-5',
    ]
    expect(preloadedEdges).toHaveLength(13)

    // Scenario A: 2 new fences + 2 new palisades enclosing tile (0,0).
    // Fence total after = 13 + 2 = 15 (exactly at cap). Expect ok.
    const playerA = createPlayer()
    playerA.resources.wood = 20
    playerA.fenceSegments = preloadedEdges.map((edge) => ({ edge, type: 'fence' }))
    const resultA = validateFenceSelection(
      playerA,
      ['H-0-0', 'V-0-0'],
      ['H-1-0', 'V-0-1'],
      0,
      0,
      { allowPalisades: true },
    )
    expect(resultA.ok).toBe(true)
    if (resultA.ok) {
      expect(getFenceCount(resultA.player)).toBe(15)
      expect(getPalisadeCount(resultA.player)).toBe(2)
    }

    // Scenario B: 3 new fences + 1 new palisade enclosing tile (0,0).
    // Fence total after = 13 + 3 = 16 (over cap). Expect MAX_FENCES_EXCEEDED
    // even though palisades are not counted toward the cap.
    const playerB = createPlayer()
    playerB.resources.wood = 20
    playerB.fenceSegments = preloadedEdges.map((edge) => ({ edge, type: 'fence' }))
    const resultB = validateFenceSelection(
      playerB,
      ['H-0-0', 'H-1-0', 'V-0-0'],
      ['V-0-1'],
      0,
      0,
      { allowPalisades: true },
    )
    expect(resultB.ok).toBe(false)
    if (!resultB.ok) {
      expect(resultB.error.code).toBe('MAX_FENCES_EXCEEDED')
    }
  })

  it('writes fence segments with correct fence/palisade types', () => {
    const player = createPlayer()
    player.resources.wood = 10
    const result = validateFenceSelection(
      player,
      ['H-0-0', 'V-0-0'],
      ['H-1-0', 'V-0-1'],
      0,
      0,
      { allowPalisades: true },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      const fenceEdges = result.player.fenceSegments
        .filter((s) => s.type === 'fence')
        .map((s) => s.edge)
        .sort()
      const palisadeEdges = result.player.fenceSegments
        .filter((s) => s.type === 'palisade')
        .map((s) => s.edge)
        .sort()
      expect(fenceEdges).toEqual(['H-0-0', 'V-0-0'])
      expect(palisadeEdges).toEqual(['H-1-0', 'V-0-1'])
    }
  })
})
