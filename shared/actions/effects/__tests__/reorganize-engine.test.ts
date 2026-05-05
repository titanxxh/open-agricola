import { describe, it, expect } from 'vitest'
import { reorganizeAction } from '../reorganize'
import type {
  ActionExecutionContext,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../../game/types'

const dummySpace: ActionSpace = {
  id: '__subflow:reorganize',
  nameKey: '',
  kind: 'synthetic',
} as unknown as ActionSpace

const makeCtx = (opts: {
  player?: Partial<PlayerState>
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
  it('confirm without payload returns fail with logKey', () => {
    const ctx = makeCtx()
    const result = reorganizeAction.resolveChoice!(ctx, 'confirm', undefined)
    expect(result.type).toBe('fail')
    if (result.type !== 'fail') throw new Error('not fail')
    expect(result.logKey).toBe('log.reorganizeFail')
  })

  it('cancel returns ok without mutation', () => {
    const ctx = makeCtx({ player: { resources: { sheep: 3 } as never } })
    ctx.player.resources.sheep = 3
    const result = reorganizeAction.resolveChoice!(ctx, 'cancel')
    expect(result.type).toBe('ok')
    expect(ctx.player.resources.sheep).toBe(3)
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
})
