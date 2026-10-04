import { getFarmyardEdgeIds, getFarmyardTilePositions } from '../../../domain/farm'
import { describe, expect, it } from 'vitest'
import { canStartFencing, fenceAction } from '../fencing'
import { CardRegistry } from '../../../cards/registry'
import { withActiveRegistry } from '../../../cards/active-registry'
import type {
  ActionExecutionContext,
  ActionAvailabilityContext,
  FarmTilePosition,
  FenceSegment,
  GameState,
  InteractionRequest,
  PlayerState,
} from '../../../contract/types'

const fakeState = { actionSpaces: [], players: [] } as unknown as GameState

const createPlayer = (overrides?: Partial<PlayerState>): PlayerState =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [], rooms: 2, houseType: 'wood',
    fields: [], roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],
    houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
    ...overrides,
  }) as unknown as PlayerState

const createOrdinaryFenceSegments = (
  count: number,
  source: FenceSegment['source'] = { kind: 'own', ownerPlayerId: 'p1' },
): FenceSegment[] =>
  Array.from({ length: count }, (_, index) => ({
    edge: getFarmyardEdgeIds(createPlayer())[index]!,
    type: 'fence',
    source,
  }))

// Independent bitmask oracle: group connected subsets by size, then by tile
// index, matching the observable order of the cost queries for each candidate.
const expectedFenceCandidates = (tiles: FarmTilePosition[]): string[][] => {
  const subsets: number[][] = []
  for (let mask = 1; mask < 2 ** tiles.length; mask += 1) {
    const selected = tiles.flatMap((_, index) => mask & (1 << index) ? [index] : [])
    const reached = new Set([selected[0]!])
    const queue = [selected[0]!]
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const from = tiles[queue[cursor]!]!
      for (const index of selected) {
        const to = tiles[index]!
        if (!reached.has(index) && Math.abs(from.row - to.row) + Math.abs(from.col - to.col) === 1) {
          reached.add(index)
          queue.push(index)
        }
      }
    }
    if (reached.size === selected.length) subsets.push(selected)
  }
  subsets.sort((left, right) => {
    if (left.length !== right.length) return left.length - right.length
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return left[index]! - right[index]!
    }
    return 0
  })
  return subsets.map(selected => {
    const edges = new Set<string>()
    for (const index of selected) {
      const { row, col } = tiles[index]!
      for (const edge of [`H-${row}-${col}`, `H-${row + 1}-${col}`, `V-${row}-${col}`, `V-${row}-${col + 1}`]) {
        if (!edges.delete(edge)) edges.add(edge)
      }
    }
    return [...edges].sort()
  })
}

describe('canStartFencing with costOverride', () => {
  it.each([0, 1, 0b010101, 0b011011, 0b111111])('preserves ordered connected candidates and affordability with open-tile mask %i', openMask => {
    const player = createPlayer({ roomTiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }] })
    const available = [
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 },
      { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 },
    ].filter((_, index) => openMask & (1 << index))
    const matches = (left: FarmTilePosition, right: FarmTilePosition) => left.row === right.row && left.col === right.col
    player.fields = getFarmyardTilePositions(player)
      .filter(tile => !available.some(open => matches(tile, open)) && !player.roomTiles.some(room => matches(tile, room)))
      .map(tile => ({ ...tile, stacks: [] }))
    const expected = expectedFenceCandidates(available)
    const observed: string[][] = []
    let surcharge = 1_000
    const registry = new CardRegistry()
    registry.registerListener({
      id: 'test-fence-candidate-order',
      phases: ['computeCosts'],
      actions: ['fence'],
      monotoneFenceCost: true,
      handler: ({ params }) => {
        observed.push([...(params?.newFenceEdges as string[])])
        return { costs: { wood: surcharge } }
      },
    })
    withActiveRegistry(registry, () => {
      expect(canStartFencing(fakeState, player)).toBe(false)
      expect(observed).toEqual(expected)
      surcharge = 0
      player.resources.wood = 15
      expect(canStartFencing(fakeState, player)).toBe(available.length > 0)
    })
  })

  it('returns true when wood + override.wood discount >= 4', () => {
    const player = createPlayer({
      resources: {
        wood: 1, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      },
    })
    expect(canStartFencing(fakeState, player)).toBe(false)
    expect(canStartFencing(fakeState, player, { wood: -3 })).toBe(true)
  })

  it('treats undefined override the same as zero override', () => {
    const player = createPlayer({
      resources: {
        wood: 4, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      },
    })
    expect(canStartFencing(fakeState, player)).toBe(true)
    expect(canStartFencing(fakeState, player, undefined)).toBe(true)
    expect(canStartFencing(fakeState, player, { wood: 0 })).toBe(true)
  })

  it('allows policy-driven free rebuild below the normal action minimum', () => {
    const player = createPlayer({
      fenceSegments: createOrdinaryFenceSegments(12),
    })
    expect(canStartFencing(fakeState, player)).toBe(false)
    expect(
      canStartFencing(fakeState, player, undefined, {
        fencePolicy: {
          segmentBounds: { fence: { min: 2 } },
          costPolicy: { fence: { wood: 0 } },
        },
      }),
    ).toBe(true)
  })

  it('rejects a total max that cannot enclose any area', () => {
    const player = createPlayer()

    expect(
      canStartFencing(fakeState, player, undefined, {
        fencePolicy: {
          segmentBounds: { total: { max: 3 } },
          costPolicy: { fence: { wood: 0 } },
        },
      }),
    ).toBe(false)
  })

  it('applies costOverride discounts to nested fencePolicy costPolicy checks', () => {
    const player = createPlayer({
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      },
    })
    const actionContext = {
      fencePolicy: {
        costPolicy: { fence: { wood: 1 } },
      },
    }
    expect(canStartFencing(fakeState, player, undefined, actionContext)).toBe(false)
    expect(canStartFencing(fakeState, player, { wood: -4 }, actionContext)).toBe(true)
  })

  it('rejects insufficient supply when no existing fence can help close an area', () => {
    const player = createPlayer({
      supplyTokensConsumed: { fence: 13 },
    })

    expect(
      canStartFencing(fakeState, player, undefined, {
        fencePolicy: {
          segmentBounds: { total: { max: 3 } },
          costPolicy: { fence: { wood: 0 } },
        },
      }),
    ).toBe(false)
  })

  it('ignores flat segmentBounds and costPolicy actionContext fields', () => {
    const player = createPlayer({
      fenceSegments: [],
    })
    expect(
      canStartFencing(fakeState, player, undefined, {
        segmentBounds: { fence: { min: 2 } },
        costPolicy: { fence: { wood: 0 } },
      }),
    ).toBe(false)
  })

  it('canBeExecutedByPlayer forwards nested fencePolicy', () => {
    const player = createPlayer({
      fenceSegments: createOrdinaryFenceSegments(12),
    })
    expect(fenceAction.canBeExecutedByPlayer(fakeState, player)).toBe(false)
    expect(
      fenceAction.canBeExecutedByPlayer(fakeState, player, {
        actionContext: {
          fencePolicy: {
            segmentBounds: { fence: { min: 2 } },
            costPolicy: { fence: { wood: 0 } },
          },
        },
      }),
    ).toBe(true)
  })

  it('costPreview.canExecute forwards nested fencePolicy', () => {
    const player = createPlayer({
      fenceSegments: createOrdinaryFenceSegments(12),
    })
    const context = {
      state: fakeState,
      player,
      actionContext: {
        fencePolicy: {
          segmentBounds: { fence: { min: 2 } },
          costPolicy: { fence: { wood: 0 } },
        },
      },
    } as ActionAvailabilityContext & { actionContext: Record<string, unknown> }
    expect(fenceAction.costPreview?.canExecute?.(context)).toBe(true)
  })

  it('rejects ownOnly policy when own ordinary supply is below the policy minimum', () => {
    const player = createPlayer({
      fenceSegments: [
        ...createOrdinaryFenceSegments(14),
        {
          edge: 'borrowed-edge',
          type: 'fence',
          source: { kind: 'borrowed', ownerPlayerId: 'p2' },
        },
      ],
    })
    expect(
      canStartFencing(fakeState, player, undefined, {
        fencePolicy: {
          sourcePolicy: 'ownOnly',
          segmentBounds: { fence: { min: 2 } },
          costPolicy: { fence: { wood: 0 } },
        },
      }),
    ).toBe(false)
  })

  it('allows a total-bound policy to start when palisades can cover missing ordinary fences', () => {
    const player = createPlayer({
      resources: {
        wood: 8, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      },
      minorPlayed: ['B030_WoodPalisades'],
      supplyTokensConsumed: { fence: 12 },
    })
    expect(
      canStartFencing(fakeState, player, undefined, {
        fencePolicy: {
          sourcePolicy: 'ownOnly',
          segmentBounds: { total: { max: 6 } },
          costPolicy: { fence: { wood: 0 }, fixedWood: 2 },
        },
      }),
    ).toBe(true)
  })

  it('rejects a total-bound pasture policy when palisades cannot make a legal pasture', () => {
    const player = createPlayer({
      resources: {
        wood: 20, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      },
      minorPlayed: ['B030_WoodPalisades'],
      supplyTokensConsumed: { fence: 13 },
    })
    expect(
      canStartFencing(fakeState, player, undefined, {
        fencePolicy: {
          sourcePolicy: 'ownOnly',
          segmentBounds: { total: { max: 6 } },
          costPolicy: { fence: { wood: 0 }, fixedWood: 2 },
          pastureBounds: {
            newPastures: { min: 1, max: 1 },
            changedPastures: { min: 1, max: 1 },
            newPastureSize: { min: 2, max: 2 },
          },
        },
      }),
    ).toBe(false)
  })

  it('uses the fixed extra wood from the farm request', () => {
    const player = createPlayer()
    player.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }]
    player.fields = [
      { row: 0, col: 1, stacks: [] }, { row: 0, col: 2, stacks: [] },
      { row: 0, col: 3, stacks: [] }, { row: 0, col: 4, stacks: [] },
      { row: 1, col: 1, stacks: [] }, { row: 1, col: 2, stacks: [] },
      { row: 1, col: 3, stacks: [] }, { row: 1, col: 4, stacks: [] },
      { row: 2, col: 0, stacks: [] }, { row: 2, col: 1, stacks: [] },
      { row: 2, col: 2, stacks: [] }, { row: 2, col: 3, stacks: [] },
    ]
    const state = { ...fakeState, players: [player] }
    const context = {
      state,
      player,
      space: { id: 'farm-redevelopment' },
      actionContext: {
        fencePolicy: {
          segmentBounds: { total: { min: 4, max: 4 } },
          costPolicy: { fence: { wood: 0 } },
        },
      },
    } as unknown as ActionExecutionContext
    const edges = ['H-2-4', 'H-3-4', 'V-2-4', 'V-2-5']
    expect(fenceAction.resolveChoice!(context, 'confirm', { edges, extraWood: 1 })).toMatchObject({ type: 'fail' })
    expect(player.fenceSegments).toEqual([])
    expect(fenceAction.resolveChoice!(context, 'confirm', { edges, extraWood: 0 }).type).toBe('ok')
  })
})
