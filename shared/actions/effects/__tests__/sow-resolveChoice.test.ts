import { describe, expect, it } from 'vitest'
import { sowAction } from '../sow'
import type {
  ActionExecutionContext,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../../game/types'

const dummySpace: ActionSpace = { id: 'sow', type: 'sow' } as unknown as ActionSpace

const makeCtx = (
  opts: {
    player?: Partial<PlayerState>
    actionContext?: Record<string, unknown>
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
      grain: 2,
      vegetable: 1,
      food: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
    },
    fields: [
      { row: 0, col: 0, stacks: [] },
      { row: 0, col: 1, stacks: [] },
    ],
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
  } as ActionExecutionContext
}

describe('sowAction.resolveChoice', () => {
  it('cancel returns ok', () => {
    const result = sowAction.resolveChoice!(makeCtx(), 'cancel')
    expect(result.type).toBe('ok')
  })

  it('first call with crops payload sows the selected fields', () => {
    const ctx = makeCtx()
    const result = sowAction.resolveChoice!(ctx, 'confirm', {
      crops: [
        { row: 0, col: 0, crop: 'grain' },
        { row: 0, col: 1, crop: 'vegetable' },
      ],
    })
    expect(result.type).toBe('ok')
    const grainField = ctx.player.fields.find((f) => f.row === 0 && f.col === 0)
    const vegField = ctx.player.fields.find((f) => f.row === 0 && f.col === 1)
    expect(grainField?.stacks[0]?.kind).toBe('grain')
    expect(grainField?.stacks[0]?.remaining).toBe(3)
    expect(vegField?.stacks[0]?.kind).toBe('vegetable')
    expect(vegField?.stacks[0]?.remaining).toBe(2)
    expect(ctx.player.resources.grain).toBe(1)
    expect(ctx.player.resources.vegetable).toBe(0)
  })

  it('first call with invalid selection returns fail', () => {
    const ctx = makeCtx()
    const result = sowAction.resolveChoice!(ctx, 'confirm', {
      // Targeting a tile that is not a field — should fail.
      crops: [{ row: 1, col: 0, crop: 'grain' }],
    })
    expect(result.type).toBe('fail')
  })

  it('first call with empty crops array returns fail', () => {
    const ctx = makeCtx()
    const result = sowAction.resolveChoice!(ctx, 'confirm', { crops: [] })
    expect(result.type).toBe('fail')
  })

  it('bare confirm with no payload + no farmPayload is transitional no-op', () => {
    // PR 3 transition: legacy commitFarmChoice('sow', ...) drives engine with
    // bare 'confirm'. Listener returns ok so after-hooks still fire.
    const ctx = makeCtx()
    const before = JSON.stringify(ctx.player)
    const result = sowAction.resolveChoice!(ctx, 'confirm')
    expect(result.type).toBe('ok')
    expect(JSON.stringify(ctx.player)).toBe(before)
  })

  it('confirm with non-crops payload returns fail', () => {
    const ctx = makeCtx()
    const result = sowAction.resolveChoice!(ctx, 'confirm', { crops: 'not-an-array' })
    expect(result.type).toBe('fail')
  })
})
