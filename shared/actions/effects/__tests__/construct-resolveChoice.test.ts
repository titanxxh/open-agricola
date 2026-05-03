import { describe, expect, it } from 'vitest'
import { constructAction } from '../construct'
import type {
  ActionExecutionContext,
  ActionSpace,
  FarmTilePosition,
  GameState,
  PlayerState,
  Resource,
} from '../../../game/types'

const dummySpace: ActionSpace = { id: 'construct', type: 'construct' } as unknown as ActionSpace

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
  it('cancel returns ok', () => {
    const result = constructAction.resolveChoice!(makeCtx(), 'cancel')
    expect(result.type).toBe('ok')
  })

  it('first call with payload + single payment combo finalizes immediately', () => {
    const room: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx()
    const result = constructAction.resolveChoice!(ctx, 'confirm', { rooms: [room] })
    expect(result.type).toBe('ok')
    expect(ctx.player.rooms).toBe(3)
    expect(ctx.player.roomTiles.some((t) => t.row === 0 && t.col === 0)).toBe(true)
    expect(ctx.player.resources.wood).toBe(5)
    expect(ctx.player.resources.reed).toBe(3)
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
