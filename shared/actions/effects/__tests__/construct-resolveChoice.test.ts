import { describe, expect, it } from 'vitest'
import '../../../cards/B/B38_FutureBuildingSite'
import { readCardResourceStats } from '../../../cards/helpers/card-state'
import { constructAction } from '../construct'
import type {
  ActionExecutionContext,
  ActionSpace,
  FarmTilePosition,
  GameState,
  PlayerState,
  Resource,
} from '../../../contract/types'

const dummySpace: ActionSpace = { id: 'construct', type: 'construct' } as unknown as ActionSpace

type TestCostAttributionContext = ActionExecutionContext & {
  costAttribution?: Array<{ sourceCard: string; costs: Partial<Resource> }>
}

const b38LockedAdjacentRooms: FarmTilePosition[] = [
  { row: 0, col: 0 },
  { row: 0, col: 1 },
  { row: 1, col: 2 },
  { row: 2, col: 0 },
  { row: 2, col: 1 },
]

const makeCtx = (
  opts: {
    player?: Partial<PlayerState>
    actionContext?: Record<string, unknown>
    costs?: Partial<Resource>
    sourceCard?: string
  } = {},
): ActionExecutionContext => {
  const player = {
    id: 'p1',
    name: 'P1',
    resources: {
      wood: 10,
      clay: 0,
      stone: 0,
      reed: 5,
      grain: 0,
      vegetable: 0,
      food: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
    },
    fields: [],
    rooms: 2,
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
    houseType: 'wood' as const,
    activeModifiers: [],
    ...(opts.player ?? {}),
  } as unknown as PlayerState
  const state = { players: [player] } as unknown as GameState
  return {
    state,
    player,
    space: dummySpace,
    actionContext: opts.actionContext,
    costs: opts.costs,
    sourceCard: opts.sourceCard,
  } as ActionExecutionContext
}

describe('constructAction.resolveChoice', () => {
  it('is not executable when locked tiles leave no reachable room selection', () => {
    const ctx = makeCtx({
      player: {
        minorPlayed: ['B38_FutureBuildingSite'],
        cardStates: {
          B38_FutureBuildingSite: { extraData: { locked: b38LockedAdjacentRooms } },
        },
      },
    })

    expect(constructAction.canBeExecutedByPlayer(ctx.state, ctx.player)).toBe(false)
    expect(constructAction.costPreview?.canExecute?.(ctx)).toBe(false)
  })

  it('cancel returns recoverable fail', () => {
    const result = constructAction.resolveChoice!(makeCtx(), 'cancel')
    expect(result).toEqual({
      type: 'fail',
      errorKey: 'log.buildRoomFail',
      recoverable: true,
    })
  })

  it('cancel returns recoverable fail when forbidCancel has no reachable room selection', () => {
    const result = constructAction.resolveChoice!(
      makeCtx({
        player: {
          resources: { wood: 0, clay: 0, stone: 0, reed: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 } as Resource,
          roomTiles: [
            { row: 0, col: 0 },
            { row: 0, col: 4 },
          ],
          fields: [
            { row: 0, col: 1, stacks: [] },
            { row: 1, col: 0, stacks: [] },
            { row: 0, col: 3, stacks: [] },
            { row: 1, col: 4, stacks: [] },
          ],
        },
        actionContext: { cancelPolicy: 'forbidCancel', maxRooms: 1, exactCost: { max: 1 } },
      }),
      'cancel',
    )

    expect(result).toEqual({
      type: 'fail',
      errorKey: 'log.buildRoomFail',
      recoverable: true,
    })
  })

  it('first call with payload + single payment combo finalizes immediately', () => {
    const room: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx()
    const result = constructAction.resolveChoice!(ctx, 'confirm', { rooms: [room] })
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ wood: 5, reed: 2 })
    expect(ctx.player.rooms).toBe(3)
    expect(ctx.player.roomTiles.some((t) => t.row === 0 && t.col === 0)).toBe(true)
    expect(ctx.player.resources.wood).toBe(10)
    expect(ctx.player.resources.reed).toBe(5)
    expect(result.internalChildren?.beforeHostListeners).toMatchObject([
      {
        actionId: 'pay',
        params: {
          costType: 'construct',
          optionPrefix: 'pay:room',
        },
      },
    ])
  })

  it('fail when rooms array empty', () => {
    const ctx = makeCtx()
    const result = constructAction.resolveChoice!(ctx, 'confirm', { rooms: [] })
    expect(result.type).toBe('fail')
  })

  it('second call after farmPayload reads rooms from actionContext and finalizes', () => {
    const room: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx({
      actionContext: { farmPayload: { rooms: [room] } },
    })
    const result = constructAction.resolveChoice!(ctx, 'pay:room:0')
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ wood: 5, reed: 2 })
    expect(ctx.player.rooms).toBe(3)
    expect(ctx.player.roomTiles.some((t) => t.row === 0 && t.col === 0)).toBe(true)
  })

  it('second call without farmPayload returns fail', () => {
    const result = constructAction.resolveChoice!(makeCtx(), 'pay:room:0')
    expect(result.type).toBe('fail')
  })

  it('respects maxUnits cap from actionContext.maxRooms', () => {
    const roomA: FarmTilePosition = { row: 0, col: 0 }
    const roomB: FarmTilePosition = { row: 2, col: 0 }
    const ctx = makeCtx({
      player: { resources: { wood: 20, clay: 0, stone: 0, reed: 10, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 } as Resource },
      actionContext: { maxRooms: 1 },
    })
    const result = constructAction.resolveChoice!(ctx, 'confirm', { rooms: [roomA, roomB] })
    expect(result.type).toBe('fail')
  })

  it('exactCost { max: 1 } builds one room for free', () => {
    const room: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx({
      player: { resources: { wood: 0, clay: 0, stone: 0, reed: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 } as Resource },
      actionContext: { maxRooms: 1, exactCost: { max: 1 } },
    })
    const result = constructAction.resolveChoice!(ctx, 'confirm', { rooms: [room] })
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({})
    expect(ctx.player.rooms).toBe(3)
  })

  it('execute exposes one selectable room tile for free exactCost max', () => {
    const ctx = makeCtx({
      player: { resources: { wood: 0, clay: 0, stone: 0, reed: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 } as Resource },
      actionContext: { maxRooms: 1, exactCost: { max: 1 } },
    })
    const result = constructAction.execute(ctx)
    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('farm-select')
    if (result.request.kind !== 'farm-select') return
    const optionValues = result.request.options.map((option) => option.value)
    expect(optionValues).toEqual(['confirm'])
    expect(result.request.farm.maxSelections).toBe(1)
    expect(result.request.farm.selectableTiles.length).toBeGreaterThan(0)
  })

  it('keeps legacy actionContext costOverride for free room builds', () => {
    const room: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx({
      player: { resources: { wood: 0, clay: 0, stone: 0, reed: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 } as Resource },
      actionContext: { costOverride: { wood: -99, reed: -99 }, maxRooms: 1 },
    })
    const result = constructAction.resolveChoice!(ctx, 'confirm', { rooms: [room] })
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({})
  })

  it('exactCost max rejects building two rooms', () => {
    const roomA: FarmTilePosition = { row: 0, col: 0 }
    const roomB: FarmTilePosition = { row: 2, col: 0 }
    const ctx = makeCtx({
      player: { resources: { wood: 20, clay: 0, stone: 0, reed: 10, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 } as Resource },
      actionContext: { exactCost: { max: 1 } },
    })
    const result = constructAction.resolveChoice!(ctx, 'confirm', { rooms: [roomA, roomB] })
    expect(result.type).toBe('fail')
  })

  it('applies computeCosts delta after exact base', () => {
    const room: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx({
      player: { resources: { wood: 1, clay: 0, stone: 0, reed: 0, grain: 0, vegetable: 0, food: 1, sheep: 0, boar: 0, cattle: 0 } as Resource },
      actionContext: { exactCost: { wood: 1 } },
      costs: { food: 1 },
    })
    const result = constructAction.resolveChoice!(ctx, 'confirm', { rooms: [room] })
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ wood: 1, food: 1 })
  })

  it('attributes construct computeCosts savings to the source card', () => {
    const room: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx({
      player: {
        houseType: 'clay',
        resources: { wood: 0, clay: 4, stone: 0, reed: 2, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 } as Resource,
      },
      costs: { clay: -1 },
      sourceCard: 'A128_RiparianBuilder',
    }) as TestCostAttributionContext
    ctx.costAttribution = [
      { sourceCard: 'A128_RiparianBuilder', costs: { clay: -1 } },
    ]

    const result = constructAction.resolveChoice!(ctx, 'confirm', { rooms: [room] })

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ clay: 4, reed: 2 })
    const stats = readCardResourceStats(ctx.player, 'A128_RiparianBuilder')
    expect(stats?.saved).toEqual({ clay: 1 })
    expect(stats?.paid).toEqual({})
  })

  it('clamps construct computeCosts savings attribution to the original cost', () => {
    const room: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx({
      player: {
        houseType: 'clay',
        resources: { wood: 0, clay: 0, stone: 0, reed: 2, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 } as Resource,
      },
      actionContext: { exactCost: { clay: 1, reed: 2 } },
      costs: { clay: -2 },
      sourceCard: 'A128_RiparianBuilder',
    }) as TestCostAttributionContext
    ctx.costAttribution = [
      { sourceCard: 'A128_RiparianBuilder', costs: { clay: -2 } },
    ]

    const result = constructAction.resolveChoice!(ctx, 'confirm', { rooms: [room] })

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ reed: 2 })
    expect(readCardResourceStats(ctx.player, 'A128_RiparianBuilder')?.saved).toEqual({ clay: 1 })
  })

  it('attributes construct computeCosts surcharges to the source card', () => {
    const room: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx({
      player: {
        resources: { wood: 5, clay: 0, stone: 0, reed: 2, grain: 0, vegetable: 0, food: 1, sheep: 0, boar: 0, cattle: 0 } as Resource,
      },
      costs: { food: 1 },
      sourceCard: 'TEST_SurchargeCard',
    }) as TestCostAttributionContext
    ctx.costAttribution = [
      { sourceCard: 'TEST_SurchargeCard', costs: { food: 1 } },
    ]

    const result = constructAction.resolveChoice!(ctx, 'confirm', { rooms: [room] })

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ wood: 5, reed: 2, food: 1 })
    expect(readCardResourceStats(ctx.player, 'TEST_SurchargeCard')?.paid).toEqual({ food: 1 })
  })

  it('credits sourceCard stats with roomWood when wooden house', () => {
    const room: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx({ sourceCard: 'A111_WallBuilder' })
    const result = constructAction.resolveChoice!(ctx, 'confirm', { rooms: [room] })
    expect(result.type).toBe('ok')
    const gained = ctx.player.cardStates?.['A111_WallBuilder']?.extraData?.resourceStats as
      | { gained?: Record<string, number> }
      | undefined
    expect(gained?.gained?.roomWood).toBe(1)
  })

  it('credits sourceCard stats with roomStone when stone house', () => {
    const room: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx({
      player: {
        houseType: 'stone',
        resources: { wood: 0, clay: 0, stone: 10, reed: 5, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 } as Resource,
      },
      sourceCard: 'X_StoneCard',
    })
    const result = constructAction.resolveChoice!(ctx, 'confirm', { rooms: [room] })
    expect(result.type).toBe('ok')
    const gained = ctx.player.cardStates?.['X_StoneCard']?.extraData?.resourceStats as
      | { gained?: Record<string, number> }
      | undefined
    expect(gained?.gained?.roomStone).toBe(1)
  })
})
