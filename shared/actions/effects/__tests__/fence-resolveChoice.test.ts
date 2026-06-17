import { describe, expect, it } from 'vitest'
import '../../../cards/B/B30_WoodPalisades'
import { fenceAction } from '../fencing'
import { storePendingFenceBonus } from '../../../cards/helpers/pending-fence-bonus'
import { getOwnOrdinaryFenceReserveCount } from '../../../domain/supply-tokens'
import { SessionCardContext, withSessionContext } from '../../../cards/session-card-context'
import type { CardListenerRegistration } from '../../../cards/card-listeners'
import type {
  ActionMutationContext,
  ActionSpace,
  DraftGameEvent,
  GameState,
  PlayerState,
  Resource,
} from '../../../contract/types'

const dummySpace: ActionSpace = { id: 'fencing', type: 'fencing' } as unknown as ActionSpace

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const widePastureEdges = [
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
  'V-2-1',
  'V-0-5',
  'V-1-5',
  'V-2-5',
]

const twoCellPastureEdges = [
  'H-0-1',
  'H-0-2',
  'H-1-1',
  'H-1-2',
  'V-0-1',
  'V-0-3',
]

const borrowedPolicy = (donorCaps: Record<string, number>) => ({
  allowedSegmentTypes: ['fence'],
  sourcePolicy: { kind: 'borrowed', donorCaps },
  segmentBounds: { fence: { min: 1 }, total: { min: 1 } },
  costPolicy: { fence: { wood: 0 } },
})

const openAirPasturePolicy = {
  sourcePolicy: 'ownOnly',
  segmentBounds: { fence: { max: 6 } },
  costPolicy: { fence: { wood: 0 }, fixedWood: 2 },
  pastureBounds: {
    newPastures: { min: 1, max: 1 },
    changedPastures: { min: 1, max: 1 },
    newPastureSize: { min: 2, max: 2 },
  },
} as const

const makeCtx = (
  opts: {
    player?: Partial<PlayerState>
    otherPlayers?: Partial<PlayerState>[]
    actionContext?: Record<string, unknown>
    costs?: Partial<Resource>
    events?: string[]
    rawEvents?: DraftGameEvent[]
  } = {},
): ActionMutationContext => {
  const player = {
    id: 'p1',
    name: 'P1',
    resources: {
      wood: 4,
      clay: 0,
      stone: 0,
      reed: 0,
      grain: 0,
      vegetable: 0,
      food: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
    },
    fields: [],
    roomTiles: [
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ],
    stableTiles: [],
    pastures: [],
    fenceSegments: [],
    cardStates: {},
    improvements: [],
    minorPlayed: [],
    occupationPlayed: [],
    activeModifiers: [],
    ...(opts.player ?? {}),
  } as unknown as PlayerState
  const otherPlayers = (opts.otherPlayers ?? []).map((other, index) => ({
    id: `p${index + 2}`,
    name: `P${index + 2}`,
    resources: {
      wood: 4,
      clay: 0,
      stone: 0,
      reed: 0,
      grain: 0,
      vegetable: 0,
      food: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
    },
    fields: [],
    roomTiles: [
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ],
    stableTiles: [],
    pastures: [],
    fenceSegments: [],
    cardStates: {},
    improvements: [],
    minorPlayed: [],
    occupationPlayed: [],
    activeModifiers: [],
    ...other,
  })) as unknown as PlayerState[]
  const state = {
    players: [player, ...otherPlayers],
    currentPlayerIndex: 0,
  } as unknown as GameState
  return {
    state,
    player,
    space: dummySpace,
    actionContext: opts.actionContext,
    costs: opts.costs,
    eventSink: {
      emit: (event: DraftGameEvent) => {
        opts.events?.push(event.type)
        opts.rawEvents?.push(event)
      },
      emitMany: (events: DraftGameEvent[]) =>
        events.forEach((event) => {
          opts.events?.push(event.type)
          opts.rawEvents?.push(event)
        }),
    },
  } as ActionMutationContext
}

describe('fenceAction.execute', () => {
  it('only exposes confirm option', () => {
    const result = fenceAction.execute(makeCtx())
    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('farm-select')
    if (result.request.kind !== 'farm-select') return
    const optionValues = result.request.options.map((option) => option.value)
    expect(optionValues).toEqual(['confirm'])
  })
})

describe('fenceAction.resolveChoice', () => {
  it('cancel returns recoverable fail', () => {
    const result = fenceAction.resolveChoice!(makeCtx(), 'cancel')
    expect(result).toEqual({
      type: 'fail',
      errorKey: 'log.fencingFail',
      recoverable: true,
    })
  })

  it('cancel fails with recoverable error when policy forbids cancel', () => {
    const result = fenceAction.resolveChoice!(
      makeCtx({ actionContext: { fencePolicy: { cancelPolicy: 'forbidCancel' } } }),
      'cancel',
    )
    expect(result).toEqual({
      type: 'fail',
      errorKey: 'log.fencingFail',
      recoverable: true,
    })
  })

  it('cancel fails with recoverable error when policy requires ordinary fences', () => {
    const result = fenceAction.resolveChoice!(
      makeCtx({
        actionContext: {
          fencePolicy: { segmentBounds: { fence: { min: 1 } } },
        },
      }),
      'cancel',
    )
    expect(result).toEqual({
      type: 'fail',
      errorKey: 'log.fencingFail',
      recoverable: true,
    })
  })

  it('cancel fails with recoverable error when policy requires total fence segments', () => {
    const result = fenceAction.resolveChoice!(
      makeCtx({
        actionContext: {
          fencePolicy: { segmentBounds: { total: { min: 1 } } },
        },
      }),
      'cancel',
    )
    expect(result).toEqual({
      type: 'fail',
      errorKey: 'log.fencingFail',
      recoverable: true,
    })
  })

  it('cancel returns recoverable fail when a mandatory pasture policy has no possible layout', () => {
    const occupiedFields = Array.from({ length: 3 }, (_, row) =>
      Array.from({ length: 5 }, (_, col) => ({ row, col, stacks: [] })),
    ).flat().filter((tile) => !(tile.row === 1 && (tile.col === 0 || tile.col === 1)))
    const result = fenceAction.resolveChoice!(
      makeCtx({
        player: {
          resources: {
            wood: 0,
            clay: 0,
            stone: 0,
            reed: 0,
            grain: 0,
            vegetable: 0,
            food: 0,
            sheep: 0,
            boar: 0,
            cattle: 0,
          },
          fields: occupiedFields,
        },
        actionContext: {
          fencePolicy: {
            segmentBounds: { total: { min: 1, max: 4 } },
            newPastureBounds: {
              count: { min: 1, max: 1 },
              totalSize: { min: 1, max: 1 },
            },
            costPolicy: { fence: { wood: 0 } },
          },
        },
      }),
      'cancel',
    )

    expect(result).toEqual({
      type: 'fail',
      errorKey: 'log.fencingFail',
      recoverable: true,
    })
  })

  it('first call with payload + payable wood finalizes immediately', () => {
    const ctx = makeCtx()
    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ wood: 4 })
    expect(ctx.player.resources.wood).toBe(4)
    expect(ctx.player.fenceSegments).toHaveLength(4)
    expect(ctx.player.pastures).toHaveLength(1)
    expect(result.internalChildren?.beforeHostListeners).toMatchObject([
      {
        actionId: 'pay',
        params: {
          costType: 'fencing',
          optionPrefix: 'pay:fence',
        },
      },
    ])
  })

  it('fails when policy minimum requires more ordinary fences', () => {
    const ctx = makeCtx({
      actionContext: {
        fencePolicy: { segmentBounds: { fence: { min: 5 } } },
      },
    })
    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(result.type).toBe('fail')
    if (result.type !== 'fail') return
    expect(result.errorKey).toBe('TOO_FEW_FENCES')
    expect(ctx.player.fenceSegments).toHaveLength(0)
  })

  it('fails when policy maximum allows fewer ordinary fences', () => {
    const ctx = makeCtx({
      actionContext: {
        fencePolicy: { segmentBounds: { fence: { max: 3 } } },
      },
    })
    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(result.type).toBe('fail')
    if (result.type !== 'fail') return
    expect(result.errorKey).toBe('TOO_MANY_FENCES')
    expect(ctx.player.fenceSegments).toHaveLength(0)
  })

  it('fails when policy total maximum allows fewer mixed fence segments', () => {
    const ctx = makeCtx({
      player: {
        resources: {
          wood: 10,
          clay: 0,
          stone: 0,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
        },
        minorPlayed: ['B30_WoodPalisades'],
      },
      actionContext: {
        fencePolicy: { segmentBounds: { total: { max: 3 } } },
      },
    })
    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: ['H-1-0', 'V-0-1'],
      palisadeEdges: ['H-0-0', 'V-0-0'],
      extraWood: 0,
    })
    expect(result.type).toBe('fail')
    if (result.type !== 'fail') return
    expect(result.errorKey).toBe('TOO_MANY_FENCES')
    expect(ctx.player.fenceSegments).toHaveLength(0)
  })

  it('fails when policy only allows ordinary fences and palisades are submitted', () => {
    const ctx = makeCtx({
      player: { minorPlayed: ['B30_WoodPalisades'] },
      actionContext: {
        fencePolicy: { allowedSegmentTypes: ['fence'] },
      },
    })
    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: ['H-1-0', 'V-0-1'],
      palisadeEdges: ['H-0-0', 'V-0-0'],
      extraWood: 0,
    })
    expect(result.type).toBe('fail')
    if (result.type !== 'fail') return
    expect(result.errorKey).toBe('SEGMENT_TYPE_NOT_ALLOWED')
    expect(ctx.player.fenceSegments).toHaveLength(0)
  })

  it('confirms policy free ordinary fences and emits fenceBuilt', () => {
    const events: string[] = []
    const ctx = makeCtx({
      player: {
        resources: {
          wood: 0,
          clay: 0,
          stone: 0,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
        },
      },
      actionContext: {
        fencePolicy: { costPolicy: { fence: { wood: 0 } } },
      },
      events,
    })
    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({})
    expect(ctx.player.resources.wood).toBe(0)
    expect(ctx.player.fenceSegments).toHaveLength(4)
    expect(events).toContain('farm.fenceBuilt')
  })

  it('builds borrowed ordinary fences and consumes donor supply', () => {
    const rawEvents: DraftGameEvent[] = []
    const donor = { id: 'p2', name: 'P2' } as Partial<PlayerState>
    const ctx = makeCtx({
      player: {
        resources: {
          wood: 0,
          clay: 0,
          stone: 0,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
        },
      },
      otherPlayers: [donor],
      actionContext: {
        fencePolicy: {
          allowedSegmentTypes: ['fence'],
          sourcePolicy: { kind: 'borrowed', donorCaps: { p2: 4 } },
          segmentBounds: { fence: { min: 1, max: 4 }, total: { min: 1, max: 4 } },
          costPolicy: { fence: { wood: 0 } },
        },
      },
      rawEvents,
    })

    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
      fenceSources: Object.fromEntries(edgesForTile(0, 0).map((edge) => [edge, 'p2'])),
    })

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({})
    expect(ctx.player.fenceSegments).toEqual(
      edgesForTile(0, 0).map((edge) => ({
        edge,
        type: 'fence',
        source: { kind: 'borrowed', ownerPlayerId: 'p2' },
      })),
    )
    expect(ctx.state.players[1]?.supplyTokensConsumed?.fence).toBe(4)
    expect(getOwnOrdinaryFenceReserveCount(ctx.state.players[1]!)).toBe(11)
    expect(rawEvents).toContainEqual(
      expect.objectContaining({
        type: 'farm.fenceBuilt',
        fences: expect.arrayContaining([
          expect.objectContaining({
            edge: 'H-0-0',
            type: 'fence',
            source: { kind: 'borrowed', ownerPlayerId: 'p2' },
          }),
        ]),
      }),
    )
  })

  it('exposes borrowed donor caps in the farm-select request', () => {
    const result = fenceAction.execute(
      makeCtx({
        actionContext: {
          fencePolicy: borrowedPolicy({ p2: 2, p3: 1 }),
        },
      }),
    )

    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('farm-select')
    if (result.request.kind !== 'farm-select') return
    expect(result.request.farm).toMatchObject({
      farmType: 'fence',
      fenceSource: { kind: 'borrowed', donorCaps: { p2: 2, p3: 1 } },
    })
  })

  it('rejects borrowed ordinary fences without per-edge sources', () => {
    const ctx = makeCtx({
      otherPlayers: [{ id: 'p2', name: 'P2' }],
      actionContext: {
        fencePolicy: borrowedPolicy({ p2: 4 }),
      },
    })

    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(result).toEqual({
      type: 'fail',
      errorKey: 'BORROWED_FENCE_SOURCE_REQUIRED',
      recoverable: true,
    })
  })

  it('rejects borrowed source maps that do not exactly match new ordinary edges', () => {
    const ctx = makeCtx({
      otherPlayers: [{ id: 'p2', name: 'P2' }],
      actionContext: {
        fencePolicy: borrowedPolicy({ p2: 4 }),
      },
    })

    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
      fenceSources: { ...Object.fromEntries(edgesForTile(0, 0).map((edge) => [edge, 'p2'])), 'H-2-2': 'p2' },
    })

    expect(result).toEqual({
      type: 'fail',
      errorKey: 'BORROWED_FENCE_SOURCE_INVALID',
      recoverable: true,
    })
  })

  it('rejects borrowed ordinary fences assigned over donor cap', () => {
    const ctx = makeCtx({
      otherPlayers: [{ id: 'p2', name: 'P2' }],
      actionContext: {
        fencePolicy: borrowedPolicy({ p2: 2 }),
      },
    })

    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
      fenceSources: Object.fromEntries(edgesForTile(0, 0).map((edge) => [edge, 'p2'])),
    })

    expect(result).toEqual({
      type: 'fail',
      errorKey: 'BORROWED_FENCE_DONOR_LIMIT_EXCEEDED',
      recoverable: true,
    })
  })

  it('rechecks donor reserve at commit time before consuming borrowed fences', () => {
    const ctx = makeCtx({
      otherPlayers: [{ id: 'p2', name: 'P2', supplyTokensConsumed: { fence: 14 } }],
      actionContext: {
        fencePolicy: borrowedPolicy({ p2: 4 }),
      },
    })

    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
      fenceSources: Object.fromEntries(edgesForTile(0, 0).map((edge) => [edge, 'p2'])),
    })

    expect(result).toEqual({
      type: 'fail',
      errorKey: 'BORROWED_FENCE_DONOR_LIMIT_EXCEEDED',
      recoverable: true,
    })
    expect(ctx.state.players[1]?.supplyTokensConsumed?.fence).toBe(14)
  })

  it('allows borrowed fences beyond the active player own ordinary limit', () => {
    const existing = [...widePastureEdges, 'H-0-0'].map((edge) => ({
      edge,
      type: 'fence' as const,
      source: { kind: 'own' as const, ownerPlayerId: 'p1' },
    }))
    const ctx = makeCtx({
      player: {
        resources: {
          wood: 0,
          clay: 0,
          stone: 0,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
        },
        roomTiles: [],
        fenceSegments: existing,
      },
      otherPlayers: [{ id: 'p2', name: 'P2' }],
      actionContext: {
        fencePolicy: borrowedPolicy({ p2: 2 }),
      },
    })

    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
      fenceSources: { 'H-1-0': 'p2', 'V-0-0': 'p2' },
    })

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(ctx.player.fenceSegments).toHaveLength(17)
    expect(ctx.state.players[1]?.supplyTokensConsumed?.fence).toBe(2)
  })

  it('applies positive computeCosts modifiers to zero-cost borrowed fencing', () => {
    const sessionContext = new SessionCardContext()
    const listener: CardListenerRegistration = {
      id: 'test-borrowed-fence-surcharge',
      phases: ['computeCosts'],
      actions: ['fence'],
      handler: () => ({ costs: { wood: 1 } }),
    }
    sessionContext.registerListener(listener)
    const ctx = makeCtx({
      player: {
        resources: {
          wood: 1,
          clay: 0,
          stone: 0,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
        },
      },
      otherPlayers: [{ id: 'p2', name: 'P2' }],
      actionContext: {
        fencePolicy: borrowedPolicy({ p2: 4 }),
      },
    })

    const result = withSessionContext(sessionContext, () =>
      fenceAction.resolveChoice!(ctx, 'confirm', {
        edges: edgesForTile(0, 0),
        palisadeEdges: [],
        extraWood: 0,
        fenceSources: Object.fromEntries(edgesForTile(0, 0).map((edge) => [edge, 'p2'])),
      }),
    )

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ wood: 1 })
  })

  it('applies computeCosts trades when settling a farm-choice fence payment', () => {
    const sessionContext = new SessionCardContext()
    const listener: CardListenerRegistration = {
      id: 'test-farm-choice-fence-trade',
      phases: ['computeCosts'],
      actions: ['fence'],
      handler: () => ({
        trades: [{
          from: {},
          to: { wood: 1 },
          max: 3,
          scope: 'action',
          sourceId: 'D82_HuntingTrophy',
        }],
      }),
    }
    sessionContext.registerListener(listener)
    const ctx = makeCtx({
      player: {
        resources: {
          wood: 1,
          clay: 0,
          stone: 0,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
        },
      },
    })

    const result = withSessionContext(sessionContext, () =>
      fenceAction.resolveChoice!(ctx, 'confirm', {
        edges: edgesForTile(0, 0),
        palisadeEdges: [],
        extraWood: 0,
      }),
    )

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ wood: 1 })
  })

  it('first call with multi-combo payment returns choice + actionContextWrite', () => {
    // 1 wood + clay/stone trade modifiers force the payment-combo prompt for
    // a 4-fence enclosure that costs 4 wood total.
    const ctx = makeCtx({
      player: {
        resources: {
          wood: 1,
          clay: 4,
          stone: 4,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
        },
        activeModifiers: [
          {
            type: 'trade',
            cardId: 'Test_Fence_Clay',
            appliesTo: ['fencing'],
            from: { clay: 2 },
            to: { wood: 2 },
            max: 2,
          },
          {
            type: 'trade',
            cardId: 'Test_Fence_Stone',
            appliesTo: ['fencing'],
            from: { stone: 2 },
            to: { wood: 2 },
            max: 2,
          },
        ] as PlayerState['activeModifiers'],
      },
    })
    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('choice')
    if (result.request.kind !== 'choice') return
    expect(result.request.options.length).toBeGreaterThan(1)
    const write = result.extraData?.actionContextWrite as
      | { farmPayload?: { edges?: string[]; palisadeEdges?: string[]; extraWood?: number } }
      | undefined
    expect(write?.farmPayload?.edges).toEqual(edgesForTile(0, 0))
    expect(write?.farmPayload?.palisadeEdges).toEqual([])
    expect(write?.farmPayload?.extraWood).toBe(0)
    // wood not yet consumed — pending payment selection.
    expect(ctx.player.resources.wood).toBe(1)
    expect(ctx.player.fenceSegments).toHaveLength(0)
  })

  it('second call after payment combo reads farmPayload from actionContext', () => {
    const ctx = makeCtx({
      actionContext: {
        farmPayload: {
          edges: edgesForTile(0, 0),
          palisadeEdges: [],
          extraWood: 0,
        },
      },
    })
    const result = fenceAction.resolveChoice!(ctx, 'pay:fence:0')
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ wood: 4 })
    expect(ctx.player.fenceSegments).toHaveLength(4)
    expect(ctx.player.pastures).toHaveLength(1)
  })

  it('second call without farmPayload returns fail', () => {
    const result = fenceAction.resolveChoice!(makeCtx(), 'pay:fence:0')
    expect(result.type).toBe('fail')
  })

  it('pendingFreeFences reduces wood cost', () => {
    const ctx = makeCtx({
      player: {
        resources: {
          wood: 0,
          clay: 0,
          stone: 0,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
        },
      },
    })
    storePendingFenceBonus(ctx.player, {
      sourceCard: 'TestFenceBonus',
      counterKey: 'fences',
      freeFences: 4,
    })
    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(result.type).toBe('ok')
    expect(ctx.player.fenceSegments).toHaveLength(4)
    expect(ctx.player.resources.wood).toBe(0)
  })

  it('rejects final fence payments above the policy budget', () => {
    const ctx = makeCtx({
      actionContext: {
        fencePolicy: {
          allowedSegmentTypes: ['fence'],
          newPastureBounds: { count: { min: 1, max: 1 } },
          costPolicy: { fence: { wood: 1 } },
          paymentBudget: { wood: 3 },
        },
      },
    })

    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(result.type).toBe('fail')
    expect(ctx.player.fenceSegments).toHaveLength(0)
    expect(ctx.player.resources.wood).toBe(4)
  })

  it('applies the fence payment budget after pending free fences reduce payment', () => {
    const ctx = makeCtx({
      actionContext: {
        fencePolicy: {
          allowedSegmentTypes: ['fence'],
          newPastureBounds: { count: { min: 1, max: 1 } },
          costPolicy: { fence: { wood: 1 } },
          paymentBudget: { wood: 3 },
        },
      },
    })
    storePendingFenceBonus(ctx.player, {
      sourceCard: 'TestFenceBonus',
      counterKey: 'fences',
      freeFences: 1,
    })

    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 0),
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ wood: 3 })
    expect(ctx.player.fenceSegments).toHaveLength(4)
    expect(ctx.player.pastures).toHaveLength(1)
  })

  it('rejects ordinary fences beyond dynamic reserve and build cap', () => {
    const existing = widePastureEdges.slice(0, 10)
    const build = widePastureEdges.slice(10)
    const ctx = makeCtx({
      player: {
        resources: {
          wood: 4,
          clay: 0,
          stone: 0,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
        },
        roomTiles: [],
        fenceSegments: existing.map((edge) => ({
          edge,
          type: 'fence',
          source: { kind: 'own', ownerPlayerId: 'p1' },
        })),
        supplyTokensConsumed: { fence: 2 },
      },
    })

    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: build,
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(result.type).toBe('fail')
    if (result.type !== 'fail') return
    expect(result.errorKey).toBe('MAX_FENCES_EXCEEDED')
  })

  it('uses selected E74 free fences when reserve is zero but build cap remains', () => {
    const existing = [...widePastureEdges.slice(0, 10), 'H-1-2']
    const build = widePastureEdges.slice(10)
    const ctx = makeCtx({
      player: {
        resources: {
          wood: 0,
          clay: 0,
          stone: 0,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
        },
        roomTiles: [],
        fenceSegments: existing.map((edge) => ({
          edge,
          type: 'fence',
          source: { kind: 'own', ownerPlayerId: 'p1' },
        })),
        cardStates: { E74_AshTrees: { counters: { fences: 4 } } },
      },
    })
    storePendingFenceBonus(ctx.player, {
      sourceCard: 'E74_AshTrees',
      counterKey: 'fences',
      freeFences: 4,
    })

    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: build,
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(result.type).toBe('ok')
    expect(ctx.player.fenceSegments).toHaveLength(15)
  })

  it('applies fixedWood after accepting one changed size-two pasture', () => {
    const ctx = makeCtx({
      player: {
        resources: {
          wood: 2,
          clay: 0,
          stone: 0,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
        },
        roomTiles: [
          { row: 2, col: 0 },
          { row: 2, col: 1 },
        ],
      },
      actionContext: { fencePolicy: openAirPasturePolicy },
    })

    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: twoCellPastureEdges,
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ wood: 2 })
    expect(ctx.player.resources.wood).toBe(2)
    expect(ctx.player.fenceSegments).toHaveLength(6)
    expect(ctx.player.pastures).toHaveLength(1)
    expect(ctx.player.pastures[0]?.size).toBe(2)
  })

  it('rejects pastureBounds violations recoverably without fixedWood payment', () => {
    const ctx = makeCtx({
      player: {
        resources: {
          wood: 2,
          clay: 0,
          stone: 0,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
        },
        roomTiles: [
          { row: 2, col: 0 },
          { row: 2, col: 1 },
        ],
      },
      actionContext: { fencePolicy: openAirPasturePolicy },
    })

    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: edgesForTile(0, 1),
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(result).toEqual({
      type: 'fail',
      errorKey: 'TOO_FEW_FENCES',
      recoverable: true,
    })
    expect(ctx.player.resources.wood).toBe(2)
    expect(ctx.player.fenceSegments).toHaveLength(0)
  })

  it('rejects final-pasture diffs that also change an existing pasture', () => {
    const ctx = makeCtx({
      player: {
        resources: {
          wood: 2,
          clay: 0,
          stone: 0,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
        },
        roomTiles: [
          { row: 2, col: 0 },
          { row: 2, col: 1 },
        ],
        fenceSegments: twoCellPastureEdges.map((edge) => ({
          edge,
          type: 'fence',
          source: { kind: 'own', ownerPlayerId: 'p1' },
        })),
        pastures: [
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
        ],
      },
      actionContext: { fencePolicy: openAirPasturePolicy },
    })

    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: ['V-0-2', 'H-2-1', 'H-2-2', 'V-1-1', 'V-1-3'],
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(result).toEqual({
      type: 'fail',
      errorKey: 'TOO_MANY_FENCES',
      recoverable: true,
    })
    expect(ctx.player.resources.wood).toBe(2)
    expect(ctx.player.fenceSegments).toHaveLength(6)
  })

  it('first call with invalid edges returns fail', () => {
    const ctx = makeCtx()
    const result = fenceAction.resolveChoice!(ctx, 'confirm', {
      edges: ['invalid-edge'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(result.type).toBe('fail')
    expect(ctx.player.fenceSegments).toHaveLength(0)
  })

  it('bare confirm without payload returns fail', () => {
    const ctx = makeCtx()
    const result = fenceAction.resolveChoice!(ctx, 'confirm')
    expect(result.type).toBe('fail')
    expect(ctx.player.fenceSegments).toHaveLength(0)
  })
})
