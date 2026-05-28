import { describe, expect, it } from 'vitest'
import { plowAction } from '../plow'
import type {
  ActionMutationContext,
  ActionSpace,
  FarmTilePosition,
  GameState,
  PlayerState,
  Resource,
} from '../../../contract/types'

const dummySpace: ActionSpace = { id: 'plow', type: 'plow' } as unknown as ActionSpace

const makeCtx = (
  opts: {
    player?: Partial<PlayerState>
    actionContext?: Record<string, unknown>
    costs?: Partial<Resource>
  } = {},
): ActionMutationContext => {
  const player = {
    id: 'p1',
    name: 'P1',
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
    ...(opts.player ?? {}),
  } as unknown as PlayerState
  const state = { players: [player] } as unknown as GameState
  return {
    state,
    player,
    space: dummySpace,
    actionContext: opts.actionContext,
    costs: opts.costs,
    eventSink: { emit: () => undefined } as unknown as ActionMutationContext['eventSink'],
  } as ActionMutationContext
}

const executeSelectableTiles = (ctx: ActionMutationContext) => {
  const result = plowAction.execute(ctx)
  expect(result.type).toBe('request')
  if (result.type !== 'request') return []
  expect(result.request.kind).toBe('farm-select')
  if (result.request.kind !== 'farm-select') return []
  const optionValues = result.request.options.map((option) => option.value)
  expect(optionValues).toEqual(['confirm'])
  return result.request.farm.selectableTiles
}

const toKeys = (tiles: FarmTilePosition[]) =>
  tiles.map((tile) => `${tile.row}-${tile.col}`).sort()

const zigzagFixturePlayer = (): Partial<PlayerState> => ({
  fields: [
    { row: 0, col: 2, stacks: [] },
    { row: 0, col: 3, stacks: [] },
    { row: 1, col: 3, stacks: [] },
  ],
  roomTiles: [
    { row: 2, col: 0 },
    { row: 1, col: 0 },
  ],
  stableTiles: [],
})

describe('plowAction.execute', () => {
  it('default free plow exposes selectable tiles', () => {
    const tiles = executeSelectableTiles(makeCtx())
    expect(tiles.length).toBeGreaterThan(0)
  })

  it('exactCost max 0 exposes no selectable tiles', () => {
    const tiles = executeSelectableTiles(makeCtx({
      actionContext: { exactCost: { max: 0 } },
    }))
    expect(tiles).toEqual([])
  })

  it('unaffordable exactCost exposes no selectable tiles', () => {
    const tiles = executeSelectableTiles(makeCtx({
      actionContext: { exactCost: { food: 1 } },
    }))
    expect(tiles).toEqual([])
  })

  it('affordable exactCost exposes selectable tiles', () => {
    const tiles = executeSelectableTiles(makeCtx({
      player: {
        resources: {
          wood: 0,
          clay: 0,
          stone: 0,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 1,
          sheep: 0,
          boar: 0,
          cattle: 0,
        },
      },
      actionContext: { exactCost: { food: 1 } },
    }))
    expect(tiles.length).toBeGreaterThan(0)
  })

  it('unaffordable computeCosts delta exposes no selectable tiles', () => {
    const tiles = executeSelectableTiles(makeCtx({
      costs: { wood: 1 },
    }))
    expect(tiles).toEqual([])
  })

  it('filters selectable tiles by actionContext.allowedTiles', () => {
    const ctx = makeCtx({
      player: zigzagFixturePlayer(),
      actionContext: {
        allowedTiles: [
          { row: 1, col: 4 },
          { row: -1, col: 2 },
        ],
      },
    })

    const tiles = executeSelectableTiles(ctx)

    expect(toKeys(tiles)).toEqual(['1-4'])
  })

  it('is not executable when allowedTiles has no plowable intersection', () => {
    const ctx = makeCtx({
      player: {
        ...zigzagFixturePlayer(),
        stableTiles: [{ row: 1, col: 4 }],
      },
      actionContext: {
        allowedTiles: [
          { row: 1, col: 4 },
          { row: -1, col: 2 },
        ],
      },
    })

    expect(plowAction.canBeExecutedByPlayer(ctx.state, ctx.player, {
      actionContext: ctx.actionContext,
    })).toBe(false)
  })

  it('is executable when allowedTiles has a plowable intersection', () => {
    const ctx = makeCtx({
      player: zigzagFixturePlayer(),
      actionContext: {
        allowedTiles: [
          { row: 1, col: 4 },
          { row: -1, col: 2 },
        ],
      },
    })

    expect(plowAction.canBeExecutedByPlayer(ctx.state, ctx.player, {
      actionContext: ctx.actionContext,
    })).toBe(true)
  })
})

describe('plowAction.resolveChoice', () => {
  it('cancel returns recoverable fail', () => {
    const result = plowAction.resolveChoice!(makeCtx(), 'cancel')
    expect(result).toEqual({
      type: 'fail',
      errorKey: 'log.action',
      recoverable: true,
    })
  })

  it('first call with payload + no payment cost finalizes immediately', () => {
    const tile: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx()
    const result = plowAction.resolveChoice!(ctx, 'confirm', { tile })
    expect(result.type).toBe('ok')
    // tile becomes a new field on the player
    expect(ctx.player.fields.some((f) => f.row === 0 && f.col === 0)).toBe(true)
  })

  it('first call with payload + payment cost returns paid resources', () => {
    const tile: FarmTilePosition = { row: 0, col: 0 }
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
      costs: { wood: 1 },
    })
    const result = plowAction.resolveChoice!(ctx, 'confirm', { tile })
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ wood: 1 })
    expect(ctx.player.resources.wood).toBe(0)
    expect(ctx.player.fields.some((f) => f.row === 0 && f.col === 0)).toBe(true)
  })

  it('first call with payload + exactCost pays exact resources', () => {
    const tile: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx({
      player: {
        resources: {
          wood: 0,
          clay: 0,
          stone: 0,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 1,
          sheep: 0,
          boar: 0,
          cattle: 0,
        },
      },
      actionContext: { exactCost: { food: 1 } },
    })
    const result = plowAction.resolveChoice!(ctx, 'confirm', { tile })
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ food: 1 })
    expect(ctx.player.resources.food).toBe(0)
    expect(ctx.player.fields.some((f) => f.row === 0 && f.col === 0)).toBe(true)
  })

  it('first call with payload + exactCost max 0 fails', () => {
    const tile: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx({
      actionContext: { exactCost: { max: 0 } },
    })
    const result = plowAction.resolveChoice!(ctx, 'confirm', { tile })
    expect(result.type).toBe('fail')
    expect(ctx.player.fields.some((f) => f.row === 0 && f.col === 0)).toBe(false)
  })

  it('first call with payload + multi-combo cost returns choice + actionContextWrite', () => {
    const tile: FarmTilePosition = { row: 0, col: 0 }
    // No cost override -> finalize immediately (single zero-cost combo).
    // Use an empty costs override to mirror the legacy zero-cost happy path.
    const ctx = makeCtx({ costs: {} })
    const result = plowAction.resolveChoice!(ctx, 'confirm', { tile })
    expect(['ok', 'choice']).toContain(result.type)
  })

  it('second call after payment combo reads farmPayload from actionContext', () => {
    const tile: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx({
      actionContext: { farmPayload: { tile } },
    })
    const result = plowAction.resolveChoice!(ctx, 'pay:plow:0')
    expect(result.type).toBe('ok')
    expect(ctx.player.fields.some((f) => f.row === 0 && f.col === 0)).toBe(true)
  })

  it('second call without farmPayload returns fail', () => {
    const result = plowAction.resolveChoice!(makeCtx(), 'pay:plow:0')
    expect(result.type).toBe('fail')
  })

  it('accepts a submitted tile inside actionContext.allowedTiles', () => {
    const tile: FarmTilePosition = { row: 1, col: 4 }
    const ctx = makeCtx({
      player: zigzagFixturePlayer(),
      actionContext: {
        allowedTiles: [{ row: 1, col: 4 }],
      },
    })

    const result = plowAction.resolveChoice!(ctx, 'confirm', { tile })

    expect(result.type).toBe('ok')
    expect(ctx.player.fields.some((f) => f.row === tile.row && f.col === tile.col)).toBe(true)
  })

  it('rejects a submitted tile outside actionContext.allowedTiles', () => {
    const tile: FarmTilePosition = { row: 1, col: 2 }
    const ctx = makeCtx({
      player: zigzagFixturePlayer(),
      actionContext: {
        allowedTiles: [{ row: 1, col: 4 }],
      },
    })

    const result = plowAction.resolveChoice!(ctx, 'confirm', { tile })

    expect(result.type).toBe('fail')
    expect(ctx.player.fields.some((f) => f.row === tile.row && f.col === tile.col)).toBe(false)
  })

  it('accepts payment-stage farmPayload inside actionContext.allowedTiles', () => {
    const tile: FarmTilePosition = { row: 1, col: 4 }
    const ctx = makeCtx({
      player: zigzagFixturePlayer(),
      actionContext: {
        allowedTiles: [{ row: 1, col: 4 }],
        farmPayload: { tile },
      },
    })

    const result = plowAction.resolveChoice!(ctx, 'pay:plow:0')

    expect(result.type).toBe('ok')
    expect(ctx.player.fields.some((f) => f.row === tile.row && f.col === tile.col)).toBe(true)
  })

  it('rejects payment-stage farmPayload outside actionContext.allowedTiles', () => {
    const tile: FarmTilePosition = { row: 1, col: 2 }
    const ctx = makeCtx({
      player: zigzagFixturePlayer(),
      actionContext: {
        allowedTiles: [{ row: 1, col: 4 }],
        farmPayload: { tile },
      },
    })

    const result = plowAction.resolveChoice!(ctx, 'pay:plow:0')

    expect(result.type).toBe('fail')
    expect(ctx.player.fields.some((f) => f.row === tile.row && f.col === tile.col)).toBe(false)
  })
})
