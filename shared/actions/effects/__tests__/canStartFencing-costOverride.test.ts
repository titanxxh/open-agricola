import { describe, expect, it } from 'vitest'
import { canStartFencing, fenceAction } from '../fencing'
import type {
  ActionAvailabilityContext,
  FenceSegment,
  GameState,
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
    edge: `test-edge-${index}`,
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

  it('ignores flat segmentBounds and costPolicy actionContext fields', () => {
    const player = createPlayer({
      fenceSegments: createOrdinaryFenceSegments(12),
    })
    expect(
      canStartFencing(fakeState, player, { wood: -3 }, {
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
})
