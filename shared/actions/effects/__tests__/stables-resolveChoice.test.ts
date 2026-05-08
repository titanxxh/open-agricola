import { describe, expect, it } from 'vitest'
import { stablesAction } from '../stables'
import { readCardResourceStats } from '../../../cards/helpers/card-state'
import type {
  ActionExecutionContext,
  ActionSpace,
  FarmTilePosition,
  GameState,
  PlayerState,
  Resource,
} from '../../../game/types'

const dummySpace: ActionSpace = { id: 'farm-expansion', type: 'farm-expansion' } as unknown as ActionSpace

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

describe('stablesAction.resolveChoice', () => {
  it('cancel returns ok', () => {
    const result = stablesAction.resolveChoice!(makeCtx(), 'cancel')
    expect(result.type).toBe('ok')
  })

  it('first call with payload + simple wood cost finalizes immediately', () => {
    const tile: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx()
    const result = stablesAction.resolveChoice!(ctx, 'confirm', { stables: [tile] })
    expect(result.type).toBe('ok')
    expect(ctx.player.stableTiles.some((t) => t.row === 0 && t.col === 0)).toBe(true)
    // 2 wood paid (default cost) out of 4 wood available.
    expect(ctx.player.resources.wood).toBe(2)
  })

  it('first call with multi-combo trade modifier returns choice + actionContextWrite', () => {
    const tile: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx({
      player: {
        resources: {
          wood: 0,
          clay: 2,
          stone: 2,
          reed: 0,
          grain: 0,
          vegetable: 0,
          food: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
        } as Resource,
        activeModifiers: [
          {
            type: 'trade',
            cardId: 'TestStableClay',
            appliesTo: ['stables'],
            from: { clay: 2 },
            to: { wood: 2 },
            max: 2,
          },
          {
            type: 'trade',
            cardId: 'TestStableStone',
            appliesTo: ['stables'],
            from: { stone: 2 },
            to: { wood: 2 },
            max: 2,
          },
        ],
      } as Partial<PlayerState>,
    })
    const result = stablesAction.resolveChoice!(ctx, 'confirm', { stables: [tile] })
    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('choice')
    expect(result.extraData?.actionContextWrite).toEqual({ farmPayload: { stables: [tile] } })
  })

  it('second call after payment combo reads farmPayload from actionContext', () => {
    const tile: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx({
      actionContext: { farmPayload: { stables: [tile] } },
    })
    const result = stablesAction.resolveChoice!(ctx, 'pay:stable:0')
    expect(result.type).toBe('ok')
    expect(ctx.player.stableTiles.some((t) => t.row === 0 && t.col === 0)).toBe(true)
  })

  it('second call without farmPayload returns fail', () => {
    const result = stablesAction.resolveChoice!(makeCtx(), 'pay:stable:0')
    expect(result.type).toBe('fail')
  })

  it('writes gained.stable when sourceCard is set', () => {
    const ctx = makeCtx({ sourceCard: 'TEST_StableSrc' })
    const tile: FarmTilePosition = { row: 0, col: 0 }
    const result = stablesAction.resolveChoice!(ctx, 'confirm', { stables: [tile] })
    expect(result.type).toBe('ok')
    const stats = readCardResourceStats(ctx.player, 'TEST_StableSrc')
    expect(stats?.gained?.stable).toBe(1)
  })

})
