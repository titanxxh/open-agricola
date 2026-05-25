import { describe, expect, it } from 'vitest'
import { stablesAction } from '../stables'
import { readCardResourceStats } from '../../../cards/helpers/card-state'
import type {
  ActionExecutionContext,
  ActionAvailabilityContext,
  ActionSpace,
  FarmTilePosition,
  GameState,
  PlayerState,
  Resource,
} from '../../../contract/types'

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
  it('is not executable when consumed stable tokens exhaust the reserve', () => {
    const ctx = makeCtx({
      player: {
        stableTiles: [],
        supplyTokensConsumed: { stable: 4 },
      } as Partial<PlayerState>,
    })

    expect(stablesAction.canBeExecutedByPlayer(ctx.state, ctx.player)).toBe(false)
  })

  it('caps stable selection max by dynamic reserve', () => {
    const ctx = makeCtx({
      player: {
        supplyTokensConsumed: { stable: 3 },
      } as Partial<PlayerState>,
      actionContext: { max: 3 },
    })

    const result = stablesAction.execute(ctx)

    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('farm-select')
    if (result.request.kind !== 'farm-select') return
    expect(result.request.farm.maxSelections).toBe(1)
  })

  it('rejects finalizing more stables than dynamic reserve', () => {
    const ctx = makeCtx({
      player: {
        supplyTokensConsumed: { stable: 3 },
      } as Partial<PlayerState>,
    })
    const result = stablesAction.resolveChoice!(ctx, 'confirm', {
      stables: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    })

    expect(result.type).toBe('fail')
  })

  it('cancel returns ok', () => {
    const result = stablesAction.resolveChoice!(makeCtx(), 'cancel')
    expect(result.type).toBe('ok')
  })

  it('cancel fails recoverably when actionContext forbids cancel', () => {
    const result = stablesAction.resolveChoice!(
      makeCtx({ actionContext: { cancelPolicy: 'forbidCancel' } }),
      'cancel',
    )
    expect(result).toMatchObject({
      type: 'fail',
      errorKey: 'log.buildStableFail',
      recoverable: true,
    })
  })

  it('first call with payload + simple wood cost finalizes immediately', () => {
    const tile: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx()
    const result = stablesAction.resolveChoice!(ctx, 'confirm', { stables: [tile] })
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ wood: 2 })
    expect(ctx.player.stableTiles.some((t) => t.row === 0 && t.col === 0)).toBe(true)
    expect(ctx.player.resources.wood).toBe(4)
    expect(result.internalChildren?.afterHostListeners).toMatchObject([
      {
        actionId: 'pay',
        params: {
          costType: 'stables',
          optionPrefix: 'pay:stable',
        },
      },
    ])
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
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ wood: 2 })
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

  it('exactCost { max: 1 } builds one stable for free without wood', () => {
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
          food: 0,
          sheep: 0,
          boar: 0,
          cattle: 0,
        } as Resource,
      },
      actionContext: { max: 1, exactCost: { max: 1 } },
    })
    const result = stablesAction.resolveChoice!(ctx, 'confirm', { stables: [tile] })
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({})
    expect(ctx.player.stableTiles).toContainEqual(tile)
  })

  it('exactCost max rejects selecting more units than the exact trade cap', () => {
    const tileA: FarmTilePosition = { row: 0, col: 0 }
    const tileB: FarmTilePosition = { row: 0, col: 1 }
    const ctx = makeCtx({
      actionContext: { exactCost: { max: 1 } },
    })
    const result = stablesAction.resolveChoice!(ctx, 'confirm', { stables: [tileA, tileB] })
    expect(result.type).toBe('fail')
  })

  it('actionContext max rejects selecting more stables than allowed', () => {
    const tileA: FarmTilePosition = { row: 0, col: 0 }
    const tileB: FarmTilePosition = { row: 0, col: 1 }
    const ctx = makeCtx({
      actionContext: { max: 1, exactCost: { wood: 0 } },
    })
    const result = stablesAction.resolveChoice!(ctx, 'confirm', { stables: [tileA, tileB] })
    expect(result.type).toBe('fail')
  })

  it('zoneFilter pasture-1 rejects backend submissions outside size-1 pastures', () => {
    const ctx = makeCtx({
      player: {
        pastures: [{
          id: 'p1',
          size: 1,
          tiles: [{ row: 2, col: 0 }],
          stables: 0,
          animalType: null,
          animalCount: 0,
        }],
      },
      actionContext: { max: 1, exactCost: { wood: 0 }, zoneFilter: 'pasture-1' },
    })
    const result = stablesAction.resolveChoice!(ctx, 'confirm', { stables: [{ row: 0, col: 1 }] })
    expect(result.type).toBe('fail')
  })

  it('zoneFilter pasture-1 accepts backend submissions inside size-1 pastures', () => {
    const tile: FarmTilePosition = { row: 2, col: 0 }
    const ctx = makeCtx({
      player: {
        pastures: [{
          id: 'p1',
          size: 1,
          tiles: [tile],
          stables: 0,
          animalType: null,
          animalCount: 0,
        }],
      },
      actionContext: { max: 1, exactCost: { wood: 0 }, zoneFilter: 'pasture-1' },
    })
    const result = stablesAction.resolveChoice!(ctx, 'confirm', { stables: [tile] })
    expect(result.type).toBe('ok')
    expect(ctx.player.stableTiles).toContainEqual(tile)
  })

  it('exactCost { wood: 1, max: 1 } pays exactly one wood, not default plus one', () => {
    const tile: FarmTilePosition = { row: 0, col: 0 }
    const ctx = makeCtx({
      actionContext: { max: 1, exactCost: { wood: 1, max: 1 } },
    })
    const result = stablesAction.resolveChoice!(ctx, 'confirm', { stables: [tile] })
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ wood: 1 })
  })

  it('applies computeCosts delta after exact stable unit cost', () => {
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
          food: 1,
          sheep: 0,
          boar: 0,
          cattle: 0,
        } as Resource,
      },
      costs: { food: 1 },
      actionContext: { exactCost: { wood: 1 } },
    })
    const result = stablesAction.resolveChoice!(ctx, 'confirm', { stables: [tile] })
    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(result.resourcesPaid).toEqual({ wood: 1, food: 1 })
  })

  it('canBeExecutedByPlayer returns false for exactCost when all stables are built', () => {
    const ctx = makeCtx({
      player: {
        stableTiles: [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
          { row: 0, col: 2 },
          { row: 0, col: 3 },
        ],
      },
    })
    expect(
      stablesAction.canBeExecutedByPlayer(ctx.state, ctx.player, {
        actionContext: { exactCost: { max: 1 } },
      }),
    ).toBe(false)
  })

  it('canBeExecutedByPlayer returns true for free exactCost without wood', () => {
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
        } as Resource,
      },
    })
    expect(
      stablesAction.canBeExecutedByPlayer(ctx.state, ctx.player, {
        actionContext: { exactCost: { max: 1 } },
      }),
    ).toBe(true)
  })

  it('canBeExecutedByPlayer returns false when pasture-1 zone has no eligible tile', () => {
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
        } as Resource,
        pastures: [],
      },
    })
    expect(
      stablesAction.canBeExecutedByPlayer(ctx.state, ctx.player, {
        actionContext: {
          exactCost: { wood: 0 },
          max: 1,
          zoneFilter: 'pasture-1',
        },
      }),
    ).toBe(false)
  })

  it('costPreview canExecute follows free exactCost and structural limits', () => {
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
        } as Resource,
      },
      actionContext: { exactCost: { max: 1 } },
    })
    const previewContext = ctx as ActionAvailabilityContext & { actionContext?: Record<string, unknown> }
    expect(stablesAction.costPreview?.canExecute?.(previewContext)).toBe(true)

    const fullCtx = makeCtx({
      player: {
        stableTiles: [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
          { row: 0, col: 2 },
          { row: 0, col: 3 },
        ],
      },
      actionContext: { exactCost: { max: 1 } },
    })
    const fullPreviewContext = fullCtx as ActionAvailabilityContext & { actionContext?: Record<string, unknown> }
    expect(stablesAction.costPreview?.canExecute?.(fullPreviewContext)).toBe(false)
  })

  it('costPreview canExecute applies computeCosts delta after exactCost', () => {
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
        } as Resource,
      },
      actionContext: { exactCost: { wood: 0 } },
    })
    const previewContext = ctx as ActionAvailabilityContext & { actionContext?: Record<string, unknown> }
    expect(stablesAction.costPreview?.canExecute?.(previewContext, { food: 1 })).toBe(false)
  })

  it('costPreview treats empty computeCosts as absent for legacy costOverride', () => {
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
        } as Resource,
      },
      actionContext: { costOverride: { wood: -1 } },
    })
    const previewContext = ctx as ActionAvailabilityContext & { actionContext?: Record<string, unknown> }
    expect(stablesAction.costPreview?.canExecute?.(previewContext, {})).toBe(true)
  })
})
