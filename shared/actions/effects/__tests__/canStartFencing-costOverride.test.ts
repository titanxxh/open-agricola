import { getFarmyardEdgeIds } from '../../../domain/farm'
import { describe, expect, it } from 'vitest'
import { canStartFencing, fenceAction } from '../fencing'
import type {
  ActionExecutionContext,
  ActionAvailabilityContext,
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

describe('canStartFencing with costOverride', () => {
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
    const request: InteractionRequest = {
      kind: 'farm-select',
      farm: { farmType: 'fence', selectableEdges: getFarmyardEdgeIds(player), extraWood: 0 },
      options: [{ value: 'confirm', labelKey: 'ui.interactionFenceConfirm' }],
    }

    expect(fenceAction.getCompletionChoices!(context, request)[Symbol.iterator]().next().done).toBe(false)
    expect([...fenceAction.getCompletionChoices!(context, {
      ...request,
      farm: { ...request.farm, extraWood: 1 },
    })]).toHaveLength(0)
  })
})
