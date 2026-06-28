import { describe, it, expect } from 'vitest'
import { reorganizeAction } from '../reorganize'
import type {
  ActionExecutionContext,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../../contract/types'
import '../../../cards/B/B012_Stockyard'
import '../../../cards/C/C011_WildlifeReserve'
import '../../../cards/C/C148_MudWallower'

const dummySpace: ActionSpace = {
  id: '__subflow:reorganize',
  nameKey: '',
  kind: 'synthetic',
} as unknown as ActionSpace

const makeCtx = (opts: {
  player?: Partial<PlayerState>
  state?: Partial<GameState>
  actionContext?: Record<string, unknown>
} = {}): ActionExecutionContext => {
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
    roomTiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
    stableTiles: [],
    pastures: [],
    fenceSegments: [],
    cardStates: {},
    improvements: [],
    minorPlayed: [],
    occupationPlayed: [],
    activeModifiers: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    ...(opts.player ?? {}),
  } as unknown as PlayerState
  const state = {
    players: [player],
    currentPlayerIndex: 0,
    ...(opts.state ?? {}),
  } as unknown as GameState
  return {
    state,
    player,
    space: dummySpace,
    actionContext: opts.actionContext,
  } as ActionExecutionContext
}

describe('reorganizeAction.execute', () => {
  it('anytime trigger emits animal-reorg request with zones', () => {
    const ctx = makeCtx({ actionContext: { trigger: 'anytime' } })
    const result = reorganizeAction.execute(ctx)
    expect(result.type).toBe('request')
    if (result.type !== 'request') throw new Error(`expected 'request', got ${result.type}`)
    expect(result.promptKey).toBe('ui.interactionAnimalReorg')
    expect(result.promptParams).toEqual({ trigger: 'anytime' })
    expect(result.request.kind).toBe('animal-reorg')
    if (result.request.kind !== 'animal-reorg') throw new Error('not animal-reorg')
    expect(result.request.zones).toBeInstanceOf(Array)
  })

  it('returning-home trigger emits animal-reorg request with same zone shape', () => {
    const ctx = makeCtx({ actionContext: { trigger: 'returning-home' } })
    const result = reorganizeAction.execute(ctx)
    expect(result.type).toBe('request')
    if (result.type !== 'request') throw new Error(`expected 'request', got ${result.type}`)
    expect(result.promptParams).toEqual({ trigger: 'returning-home' })
    expect(result.request.kind).toBe('animal-reorg')
    if (result.request.kind !== 'animal-reorg') throw new Error('not animal-reorg')
    expect(result.request.zones).toBeInstanceOf(Array)
  })
})

describe('reorganizeAction.resolveChoice', () => {
  it('confirm without payload returns fail with errorKey', () => {
    const ctx = makeCtx()
    const result = reorganizeAction.resolveChoice!(ctx, 'confirm', undefined)
    expect(result.type).toBe('fail')
    if (result.type !== 'fail') throw new Error('not fail')
    expect(result.errorKey).toBe('log.reorganizeFail')
  })

  it('cancel returns recoverable fail without mutation', () => {
    const ctx = makeCtx({ player: { resources: { sheep: 3 } as never } })
    ctx.player.resources.sheep = 3
    const before = JSON.parse(JSON.stringify(ctx.player))

    const result = reorganizeAction.resolveChoice!(ctx, 'cancel')

    expect(result).toEqual({
      type: 'fail',
      errorKey: 'log.reorganizeFail',
      recoverable: true,
    })
    expect(ctx.player).toEqual(before)
  })

  it('confirm with zones reduces reserve sheep when assigned to pasture', () => {
    const ctx = makeCtx()
    ctx.player.resources.sheep = 3
    ctx.player.pastures = [
      {
        id: 'pasture-1',
        size: 1,
        tiles: [{ row: 0, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]
    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{ id: 'pasture-1', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 }] as unknown as Record<string, unknown>,
    )
    expect(result.type).toBe('ok')
    expect(ctx.player.pastures[0]!.animalCount).toBe(2)
    expect(ctx.player.pastures[0]!.animalType).toBe('sheep')
    expect(ctx.player.resources.sheep).toBe(2)
  })

  it('keeps assigned horse totals when Farmers of the Moor is enabled', () => {
    const ctx = makeCtx({
      state: { enableFarmersOfTheMoor: true },
      player: {
        resources: {
          sheep: 0,
          boar: 0,
          cattle: 0,
          horse: 2,
        } as never,
        pastures: [
          {
            id: 'pasture-1',
            size: 1,
            tiles: [{ row: 0, col: 0 }],
            stables: 0,
            animalType: null,
            animalCount: 0,
          },
        ],
      },
    })

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{ id: 'pasture-1', zoneType: 'pasture', animalType: 'horse', animalCount: 1 }] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(ctx.player.pastures[0]!.animalType).toBe('horse')
    expect(ctx.player.pastures[0]!.animalCount).toBe(1)
    expect(ctx.player.resources.horse).toBe(1)
  })

  it('normalizes mixed animalCounts on same-type unkeyed card zones', () => {
    const ctx = makeCtx({
      player: {
        minorPlayed: ['B012_Stockyard'],
        resources: { sheep: 1, boar: 1 } as never,
      },
    })

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{
        id: 'card:B012_Stockyard',
        zoneType: 'card',
        animalType: 'boar',
        animalCount: 2,
        animalCounts: { sheep: 1, boar: 1 },
      }] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(ctx.player.resources.sheep).toBe(0)
    expect(ctx.player.resources.boar).toBe(1)
  })

  it('normalizes counters-held card zones before adding them to totals', () => {
    const ctx = makeCtx({
      player: {
        occupationPlayed: ['C148_MudWallower'],
        resources: { sheep: 1 } as never,
        cardStates: {
          C148_MudWallower: { counters: { counter: 0, held: 1 } },
        } as never,
      },
    })

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{
        id: 'card:C148_MudWallower',
        zoneType: 'card',
        cardId: 'C148_MudWallower',
        animalType: 'sheep',
        animalCount: 1,
        animalCounts: { sheep: 1 },
      }] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(ctx.player.resources.sheep).toBe(0)
    expect(ctx.player.resources.boar).toBe(0)
  })

  it('filters invalid card animals before clamping capacity', () => {
    const ctx = makeCtx({
      player: {
        minorPlayed: ['C011_WildlifeReserve'],
        resources: { sheep: 2, boar: 1, cattle: 1 } as never,
      },
    })

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{
        id: 'card:C011_WildlifeReserve',
        zoneType: 'card',
        cardId: 'C011_WildlifeReserve',
        animalType: null,
        animalCount: 4,
        animalCounts: { sheep: 2, boar: 1, cattle: 1 },
      }] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(ctx.player.resources.sheep).toBe(1)
    expect(ctx.player.resources.boar).toBe(1)
    expect(ctx.player.resources.cattle).toBe(1)
  })

  it('rejects horses from Wildlife Reserve card zones', () => {
    const ctx = makeCtx({
      state: { enableFarmersOfTheMoor: true },
      player: {
        minorPlayed: ['C011_WildlifeReserve'],
        resources: { sheep: 1, boar: 1, cattle: 1, horse: 1 } as never,
      },
    })

    const result = reorganizeAction.resolveChoice!(
      ctx,
      'confirm',
      [{
        id: 'card:C011_WildlifeReserve',
        zoneType: 'card',
        cardId: 'C011_WildlifeReserve',
        animalType: null,
        animalCount: 4,
        animalCounts: { sheep: 1, boar: 1, cattle: 1, horse: 1 },
      }] as unknown as Record<string, unknown>,
    )

    expect(result.type).toBe('ok')
    expect(ctx.player.resources.sheep).toBe(1)
    expect(ctx.player.resources.boar).toBe(1)
    expect(ctx.player.resources.cattle).toBe(1)
    expect(ctx.player.resources.horse).toBe(0)
  })
})
