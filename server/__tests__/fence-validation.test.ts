import { describe, expect, it } from 'vitest'
import { validateFenceSelection } from '../../shared/domain/farmyard'
import type { PlayerFarmState } from '../../shared/domain/farmyard'
import type { PlayerState } from '../../shared/contract/types'
import {
  getFenceCount,
  getPalisadeCount,
} from '../../shared/actions/effects/fencing.ts'

type AnimalAwareFarmState = PlayerFarmState &
  Pick<PlayerState, 'houseAnimalType' | 'houseAnimalCount' | 'stableAnimals' | 'cardStates'>

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

const twoCellPastureEdges = [
  'H-0-1',
  'H-0-2',
  'H-1-1',
  'H-1-2',
  'V-0-1',
  'V-0-3',
]

const threeCellPastureEdges = [
  'H-0-1',
  'H-0-2',
  'H-0-3',
  'H-1-1',
  'H-1-2',
  'H-1-3',
  'V-0-1',
  'V-0-4',
]

const twoSinglePastureEdges = [
  'H-0-1',
  'H-1-1',
  'V-0-1',
  'V-0-2',
  'H-0-3',
  'H-1-3',
  'V-0-3',
  'V-0-4',
]

const openAirPastureOptions = {
  sourcePolicy: 'ownOnly',
  segmentBounds: { total: { max: 6 } },
  costPolicy: { fence: { wood: 0 }, fixedWood: 2 },
  pastureBounds: {
    newPastures: { min: 1, max: 1 },
    changedPastures: { min: 1, max: 1 },
    newPastureSize: { min: 2, max: 2 },
  },
} as const

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
    // Border edges of tile (0,0): H-0-0 (top) and V-0-0 (left) are border.
    // Internal edges H-1-0 and V-0-1 must be regular fences.
    // Cost: 2 palisades * 2 + 2 fences * 1 = 6
    const palisadeEdges = ['H-0-0', 'V-0-0']
    const fenceEdges = ['H-1-0', 'V-0-1']
    const result = validateFenceSelection(player, fenceEdges, palisadeEdges, 0, 0, {
      allowPalisades: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payableWoodCost).toBe(6)
      expect(result.newPalisadeEdges).toEqual(palisadeEdges)
      expect(result.newFenceEdges.sort()).toEqual(fenceEdges.sort())
    }
  })

  it('freeFences only discounts fence segments, not palisades', () => {
    const player = createPlayer()
    player.resources.wood = 10
    // Palisades on border: H-0-0 (top), V-0-0 (left).
    // Fences on internal: H-1-0, V-0-1.
    const result = validateFenceSelection(
      player,
      ['H-1-0', 'V-0-1'],
      ['H-0-0', 'V-0-0'],
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
    // A fully-palisaded enclosure requires all 4 edges on the border.
    // Use a 1x1 tile at (0,4): edges H-0-4 (top border), H-1-4 (internal),
    // V-0-4 (internal), V-0-5 (right border) — still has 2 internal edges.
    // No single interior tile can be fully palisaded. Use 2 palisades + 2 fences.
    // Instead, verify that palisades-on-border + fences-internal forms a pasture
    // and fenceCount=2, palisadeCount=2.
    const player = createPlayer()
    player.resources.wood = 10
    // Palisades on border edges of tile (0,0): H-0-0, V-0-0
    // Fences on internal edges of tile (0,0): H-1-0, V-0-1
    const result = validateFenceSelection(player, ['H-1-0', 'V-0-1'], ['H-0-0', 'V-0-0'], 0, 0, {
      allowPalisades: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.newPastures).toHaveLength(1)
      expect(result.newPastures[0]?.tiles).toHaveLength(1)
      expect(getFenceCount(result.player)).toBe(2)
      expect(getPalisadeCount(result.player)).toBe(2)
    }
  })

  it('mixed fence + palisade segments enclose a pasture together', () => {
    const player = createPlayer()
    player.resources.wood = 10
    // Palisades on border: H-0-0, V-0-0. Fences on internal: H-1-0, V-0-1.
    const result = validateFenceSelection(
      player,
      ['H-1-0', 'V-0-1'],
      ['H-0-0', 'V-0-0'],
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
    // Palisades on border: H-0-0, V-0-0. Fences on internal: H-1-0, V-0-1.
    // Fence total after = 13 + 2 = 15 (exactly at cap). Expect ok.
    const playerA = createPlayer()
    playerA.resources.wood = 20
    playerA.fenceSegments = preloadedEdges.map((edge) => ({ edge, type: 'fence' }))
    const resultA = validateFenceSelection(
      playerA,
      ['H-1-0', 'V-0-1'],
      ['H-0-0', 'V-0-0'],
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
    // Palisade on border: H-0-0. Fences on internal: H-1-0, V-0-1 + border V-0-0.
    // Fence total after = 13 + 3 = 16 (over cap). Expect MAX_FENCES_EXCEEDED
    // even though palisades are not counted toward the cap.
    const playerB = createPlayer()
    playerB.resources.wood = 20
    playerB.fenceSegments = preloadedEdges.map((edge) => ({ edge, type: 'fence' }))
    const resultB = validateFenceSelection(
      playerB,
      ['H-1-0', 'V-0-0', 'V-0-1'],
      ['H-0-0'],
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
    // Palisades on border edges: H-0-0, V-0-0. Fences on internal: H-1-0, V-0-1.
    const result = validateFenceSelection(
      player,
      ['H-1-0', 'V-0-1'],
      ['H-0-0', 'V-0-0'],
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
      expect(fenceEdges).toEqual(['H-1-0', 'V-0-1'])
      expect(palisadeEdges).toEqual(['H-0-0', 'V-0-0'])
    }
  })
})

describe('palisade must be on border', () => {
  it('rejects palisade on internal edge', () => {
    const player = createPlayer()
    player.resources.wood = 10
    const result = validateFenceSelection(
      player,
      ['H-0-0', 'V-0-0'], // legal fence
      ['H-1-0'],          // palisade on internal edge — should reject
      0,
      0,
      { allowPalisades: true },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error?.code).toBe('PALISADE_NOT_ON_BORDER')
    }
  })

  it('accepts palisade on top/left border', () => {
    const player = createPlayer()
    player.resources.wood = 10
    const result = validateFenceSelection(
      player,
      ['H-1-0', 'V-0-1'],      // internal fences closing tile(0,0)
      ['H-0-0', 'V-0-0'],      // border palisades
      0,
      0,
      { allowPalisades: true },
    )
    expect(result.ok).toBe(true)
  })
})

describe('validateFenceSelection — generic fence policy', () => {
  it('builds free own-source ordinary fences when fence wood cost is zero', () => {
    const player = createPlayer()
    player.resources.wood = 0
    const edges = edgesForTile(0, 1)

    const result = validateFenceSelection(player, edges, [], 0, 0, {
      costPolicy: { fence: { wood: 0 } },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payableWoodCost).toBe(0)
      expect(result.newFenceEdges).toHaveLength(4)
      expect(result.player.resources.wood).toBe(0)
      expect(result.player.fenceSegments).toEqual(
        edges.map((edge) => ({
          edge,
          type: 'fence',
          source: { kind: 'own', ownerPlayerId: 'p1' },
        })),
      )
    }
  })

  it('charges custom ordinary fence wood cost per payable fence', () => {
    const player = createPlayer()
    player.resources.wood = 10
    const edges = edgesForTile(0, 1)

    const result = validateFenceSelection(player, edges, [], 0, 0, {
      costPolicy: { fence: { wood: 2 } },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payableWoodCost).toBe(8)
      expect(result.player.resources.wood).toBe(2)
      expect(result.player.fenceSegments).toHaveLength(4)
    }
  })

  it('adds fixed wood cost after validating the fence layout', () => {
    const player = createPlayer()
    player.resources.wood = 10
    const edges = edgesForTile(0, 1)

    const result = validateFenceSelection(player, edges, [], 0, 0, {
      costPolicy: { fixedWood: 2 },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payableWoodCost).toBe(6)
      expect(result.player.resources.wood).toBe(4)
    }
  })

  it('counts duplicate ordinary fence input once for cost and segments', () => {
    const player = createPlayer()
    player.resources.wood = 10
    const edges = [...edgesForTile(0, 1), 'H-0-1', 'V-0-1']

    const result = validateFenceSelection(player, edges)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.newFenceEdges).toEqual(edgesForTile(0, 1))
      expect(result.payableWoodCost).toBe(4)
      expect(result.player.resources.wood).toBe(6)
      expect(result.player.fenceSegments).toHaveLength(4)
    }
  })

  it('counts duplicate palisade input once for cost and segments', () => {
    const player = createPlayer()
    player.resources.wood = 10

    const result = validateFenceSelection(
      player,
      ['H-1-0', 'V-0-1'],
      ['H-0-0', 'V-0-0', 'H-0-0', 'V-0-0'],
      0,
      0,
      { allowPalisades: true },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.newPalisadeEdges).toEqual(['H-0-0', 'V-0-0'])
      expect(result.payableWoodCost).toBe(6)
      expect(result.player.resources.wood).toBe(4)
      expect(result.player.fenceSegments).toHaveLength(4)
    }
  })

  it('rejects fewer ordinary fences than the policy minimum', () => {
    const player = createPlayer()

    const result = validateFenceSelection(player, edgesForTile(0, 1), [], 0, 0, {
      segmentBounds: { fence: { min: 5 } },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('TOO_FEW_FENCES')
    }
  })

  it('rejects more ordinary fences than the policy maximum', () => {
    const player = createPlayer()

    const result = validateFenceSelection(player, edgesForTile(0, 1), [], 0, 0, {
      segmentBounds: { fence: { max: 3 } },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('TOO_MANY_FENCES')
    }
  })

  it('rejects more mixed fence segments than the policy total maximum', () => {
    const player = createPlayer()

    const result = validateFenceSelection(
      player,
      ['H-1-0', 'V-0-1'],
      ['H-0-0', 'V-0-0'],
      0,
      0,
      { allowPalisades: true, segmentBounds: { total: { max: 3 } } },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('TOO_MANY_FENCES')
    }
  })

  it('rejects ordinary fences beyond the dynamic build limit', () => {
    const player = createPlayer()
    player.resources.wood = 20
    const existing = [
      'H-0-1',
      'H-0-2',
      'H-0-3',
      'H-0-4',
      'H-3-1',
      'H-3-2',
      'H-3-3',
      'H-3-4',
      'V-0-1',
      'V-1-1',
    ]
    player.roomTiles = []
    player.fenceSegments = existing.map((edge) => ({ edge, type: 'fence' }))

    const result = validateFenceSelection(
      player,
      ['V-2-1', 'V-0-5', 'V-1-5', 'V-2-5'],
      [],
      0,
      0,
      { ordinaryFenceBuildLimit: 13 },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('MAX_FENCES_EXCEEDED')
    }
  })

  it('rejects ordinary fences beyond available reserve tokens', () => {
    const player = createPlayer()
    player.resources.wood = 20

    const result = validateFenceSelection(player, edgesForTile(0, 1), [], 0, 0, {
      availableOrdinaryFenceTokens: 3,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('MAX_FENCES_EXCEEDED')
    }
  })

  it('rejects a one-cell pasture when policy requires two new pasture cells', () => {
    const player = createPlayer()

    const result = validateFenceSelection(player, edgesForTile(0, 1), [], 0, 0, {
      newPastureBounds: { count: { min: 1, max: 1 }, totalSize: { min: 2, max: 2 } },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('PASTURE_BOUNDS_NOT_MET')
    }
  })

  it('accepts a two-cell pasture when policy requires two new pasture cells', () => {
    const player = createPlayer()

    const result = validateFenceSelection(
      player,
      ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2'],
      [],
      0,
      0,
      { newPastureBounds: { count: { min: 1, max: 1 }, totalSize: { min: 2, max: 2 } } },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.newPastures).toHaveLength(1)
      expect(result.newPastures[0]?.tiles).toHaveLength(2)
    }
  })

  it('rejects new palisades when the policy only allows ordinary fences', () => {
    const player = createPlayer()

    const result = validateFenceSelection(
      player,
      ['H-1-0', 'V-0-1'],
      ['H-0-0', 'V-0-0'],
      0,
      0,
      { allowPalisades: true, allowedSegmentTypes: ['fence'] },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('SEGMENT_TYPE_NOT_ALLOWED')
    }
  })

  it('rejects new ordinary fences when the policy only allows palisades', () => {
    const player = createPlayer()

    const result = validateFenceSelection(
      player,
      ['H-1-0', 'V-0-1'],
      ['H-0-0', 'V-0-0'],
      0,
      0,
      { allowPalisades: true, allowedSegmentTypes: ['palisade'] },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('SEGMENT_TYPE_NOT_ALLOWED')
    }
  })

  it('ignores borrowed ordinary fences for ownOnly supply cap', () => {
    const player = createPlayer()
    player.resources.wood = 20
    const borrowedEdges = [
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
      'V-2-4',
    ]
    player.fenceSegments = borrowedEdges.map((edge) => ({
      edge,
      type: 'fence',
      source: { kind: 'borrowed', ownerPlayerId: 'p2' },
    }))

    const result = validateFenceSelection(
      player,
      ['H-1-0', 'V-0-1'],
      ['H-0-0', 'V-0-0'],
      0,
      0,
      { allowPalisades: true, sourcePolicy: 'ownOnly' },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.newFenceEdges).toHaveLength(2)
      expect(
        result.player.fenceSegments.filter(
          (segment) => segment.source?.kind === 'borrowed',
        ),
      ).toHaveLength(14)
    }
  })

  it('rejects builds that would reduce animal totals when preservation is required', () => {
    const player = createPlayer()
    player.resources.sheep = 3

    const result = validateFenceSelection(player, edgesForTile(0, 1), [], 0, 0, {
      preserveAnimalTotals: true,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('ANIMAL_CAPACITY_INSUFFICIENT')
    }
  })

  it('does not duplicate a house animal into a new pasture', () => {
    const player = createPlayer() as AnimalAwareFarmState
    player.resources.boar = 1
    player.houseAnimalType = 'boar'
    player.houseAnimalCount = 1
    player.stableAnimals = {}

    const result = validateFenceSelection(player, edgesForTile(0, 1))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.player.pastures[0]?.animalType).toBeNull()
      expect(result.player.pastures[0]?.animalCount).toBe(0)
      expect(result.player.houseAnimalType).toBe('boar')
      expect(result.player.houseAnimalCount).toBe(1)
      expect(result.player.resources.boar).toBe(1)
    }
  })

  it('does not duplicate a loose stable animal into a new pasture', () => {
    const player = createPlayer() as AnimalAwareFarmState
    player.resources.sheep = 1
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.stableTiles = [{ row: 2, col: 4 }]
    player.stableAnimals = { '2-4': 'sheep' }

    const result = validateFenceSelection(player, edgesForTile(0, 1))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.player.pastures[0]?.animalType).toBeNull()
      expect(result.player.pastures[0]?.animalCount).toBe(0)
      expect(result.player.stableAnimals['2-4']).toBe('sheep')
      expect(result.player.resources.sheep).toBe(1)
    }
  })

  it('does not duplicate an extraData-held card animal into a new pasture', () => {
    const player = createPlayer() as AnimalAwareFarmState
    player.resources.cattle = 1
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.stableAnimals = {}
    player.cardStates = {
      D148_DomesticianExpert: { extraData: { held: 1, animalType: 'cattle' } },
    }

    const result = validateFenceSelection(player, edgesForTile(0, 1))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.player.pastures[0]?.animalType).toBeNull()
      expect(result.player.pastures[0]?.animalCount).toBe(0)
      expect(result.player.cardStates.D148_DomesticianExpert?.extraData?.held).toBe(1)
      expect(result.player.resources.cattle).toBe(1)
    }
  })

  it('does not duplicate a C148-held boar into a new pasture', () => {
    const player = createPlayer() as AnimalAwareFarmState
    player.resources.boar = 1
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.stableAnimals = {}
    player.cardStates = {
      C148_MudWallower: { counters: { counter: 0, held: 1 } },
    }

    const result = validateFenceSelection(player, edgesForTile(0, 1))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.player.pastures[0]?.animalType).toBeNull()
      expect(result.player.pastures[0]?.animalCount).toBe(0)
      expect(result.player.cardStates.C148_MudWallower?.counters?.held).toBe(1)
      expect(result.player.resources.boar).toBe(1)
    }
  })

  it('does not reserve more boars for C148 than are actually on the card', () => {
    const player = createPlayer() as AnimalAwareFarmState
    player.resources.boar = 2
    player.houseAnimalType = null
    player.houseAnimalCount = 0
    player.stableAnimals = {}
    player.pastures = [
      { id: 'old-pasture', size: 1, tiles: [{ row: 2, col: 1 }], stables: 0, animalType: 'boar', animalCount: 1 },
    ]
    player.cardStates = {
      C148_MudWallower: { counters: { counter: 0, held: 2 } },
    }

    const result = validateFenceSelection(player, edgesForTile(0, 1))

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.player.pastures[0]?.animalType).toBe('boar')
      expect(result.player.pastures[0]?.animalCount).toBe(1)
      expect(result.player.cardStates.C148_MudWallower?.counters?.held).toBe(2)
      expect(result.player.resources.boar).toBe(2)
    }
  })

  it('rejects too many final changed pastures by pastureBounds', () => {
    const player = createPlayer()
    player.resources.wood = 20
    player.roomTiles = []
    player.fenceSegments = [
      'H-0-1',
      'H-0-2',
      'H-1-1',
      'H-1-2',
      'V-0-1',
      'V-0-3',
    ].map((edge) => ({ edge, type: 'fence' }))
    player.pastures = [
      {
        id: 'pasture-1',
        size: 2,
        tiles: [
          { row: 0, col: 1 },
          { row: 0, col: 2 },
        ],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    const result = validateFenceSelection(player, ['V-0-2'], [], 0, 0, {
      pastureBounds: { changedPastures: { max: 1 } },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('TOO_MANY_FENCES')
    }
  })

  it('counts changedPastures as final-pasture diff only', () => {
    const player = createPlayer()
    player.resources.wood = 20
    player.roomTiles = []
    player.fenceSegments = [
      'H-0-1',
      'H-0-2',
      'H-1-1',
      'H-1-2',
      'V-0-1',
      'V-0-3',
    ].map((edge) => ({ edge, type: 'fence' }))
    player.pastures = [
      {
        id: 'pasture-1',
        size: 2,
        tiles: [
          { row: 0, col: 1 },
          { row: 0, col: 2 },
        ],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    const result = validateFenceSelection(player, ['V-0-2'], [], 0, 0, {
      pastureBounds: { changedPastures: { max: 2 } },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.newPastures).toHaveLength(2)
    }
  })

  it('accepts exactly one changed size-two pasture with fixedWood', () => {
    const player = createPlayer()
    player.resources.wood = 2
    player.roomTiles = [
      { row: 2, col: 0 },
      { row: 2, col: 1 },
    ]

    const result = validateFenceSelection(
      player,
      twoCellPastureEdges,
      [],
      0,
      0,
      openAirPastureOptions,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.payableWoodCost).toBe(2)
      expect(result.player.resources.wood).toBe(0)
      expect(result.newPastures).toHaveLength(1)
      expect(result.newPastures[0]?.size).toBe(2)
    }
  })

  it('rejects a size-one pasture with open air pasture bounds', () => {
    const player = createPlayer()
    player.resources.wood = 2
    player.roomTiles = [
      { row: 2, col: 0 },
      { row: 2, col: 1 },
    ]

    const result = validateFenceSelection(
      player,
      edgesForTile(0, 1),
      [],
      0,
      0,
      openAirPastureOptions,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('TOO_FEW_FENCES')
    }
  })

  it('rejects a size-three pasture with open air pasture bounds', () => {
    const player = createPlayer()
    player.resources.wood = 2
    player.roomTiles = [
      { row: 2, col: 0 },
      { row: 2, col: 1 },
    ]

    const result = validateFenceSelection(player, threeCellPastureEdges, [], 0, 0, {
      ...openAirPastureOptions,
      segmentBounds: undefined,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('TOO_MANY_FENCES')
    }
  })

  it('rejects multiple new pastures with open air pasture bounds', () => {
    const player = createPlayer()
    player.resources.wood = 2
    player.roomTiles = [
      { row: 2, col: 0 },
      { row: 2, col: 1 },
    ]

    const result = validateFenceSelection(player, twoSinglePastureEdges, [], 0, 0, {
      ...openAirPastureOptions,
      segmentBounds: undefined,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('TOO_MANY_FENCES')
    }
  })

  it('rejects creating one pasture while changing an existing pasture', () => {
    const player = createPlayer()
    player.resources.wood = 2
    player.roomTiles = [
      { row: 2, col: 0 },
      { row: 2, col: 1 },
    ]
    player.fenceSegments = twoCellPastureEdges.map((edge) => ({
      edge,
      type: 'fence',
      source: { kind: 'own', ownerPlayerId: player.id },
    }))
    player.pastures = [
      {
        id: 'pasture-1',
        size: 2,
        tiles: [
          { row: 0, col: 1 },
          { row: 0, col: 2 },
        ],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    const result = validateFenceSelection(
      player,
      ['V-0-2', 'H-2-1', 'H-2-2', 'V-1-1', 'V-1-3'],
      [],
      0,
      0,
      openAirPastureOptions,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('TOO_MANY_FENCES')
    }
  })
})
