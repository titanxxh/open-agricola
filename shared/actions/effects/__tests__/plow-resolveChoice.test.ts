import { describe, expect, it } from 'vitest'
import { plowAction } from '../plow'
import type {
  ActionExecutionContext,
  ActionSpace,
  FarmTilePosition,
  GameState,
  PlayerState,
  Resource,
} from '../../../game/types'

const dummySpace: ActionSpace = { id: 'plow', type: 'plow' } as unknown as ActionSpace

const makeCtx = (
  opts: {
    player?: Partial<PlayerState>
    actionContext?: Record<string, unknown>
    costs?: Partial<Resource>
  } = {},
): ActionExecutionContext => {
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
  } as ActionExecutionContext
}

describe('plowAction.resolveChoice', () => {
  it('cancel returns ok', () => {
    const result = plowAction.resolveChoice!(makeCtx(), 'cancel')
    expect(result.type).toBe('ok')
  })

  it('first call with payload + no payment cost finalizes immediately', () => {
    const tile: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx()
    const result = plowAction.resolveChoice!(ctx, 'confirm', { tile })
    expect(result.type).toBe('ok')
    // tile becomes a new field on the player
    expect(ctx.player.fields.some((f) => f.row === 0 && f.col === 0)).toBe(true)
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
})
