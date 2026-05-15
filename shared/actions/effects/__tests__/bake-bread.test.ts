import { beforeEach, describe, expect, it } from 'vitest'
import { bakeBreadAction } from '../bake-bread'
import { setActiveCardRegistry } from '../../../cards/active-registry'
import { CardRegistry } from '../../../cards/registry'
import type {
  ActionExecutionContext,
  ActionExecutionResult,
  GameState,
  PlayerState,
} from '../../../contract/types'

const baseResources = {
  wood: 0,
  clay: 0,
  stone: 0,
  reed: 0,
  grain: 3,
  vegetable: 0,
  food: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
}

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  resources: { ...baseResources },
  fields: [],
  roomTiles: [],
  stableTiles: [],
  pastures: [],
  fenceSegments: [],
  cardStates: {},
  improvements: ['Major_Fireplace1', 'Major_ClayOven'],
  minorPlayed: [],
  occupationPlayed: [],
  ...overrides,
} as unknown as PlayerState)

const makeCtx = (player = makePlayer()): ActionExecutionContext => ({
  state: { players: [player] } as unknown as GameState,
  player,
  space: {} as ActionExecutionContext['space'],
})

const expectNoBakeMutation = (
  player: PlayerState,
  result: ActionExecutionResult,
  grain = 3,
) => {
  expect(result.type).toBe('fail')
  expect(player.resources.grain).toBe(grain)
  expect(player.resources.food).toBe(0)
  expect(player.stats).toBeUndefined()
  expect('immediateLogs' in result ? result.immediateLogs : undefined).toBeUndefined()
}

describe('bakeBreadAction non-empty semantics', () => {
  beforeEach(() => {
    setActiveCardRegistry(new CardRegistry())
  })

  it('execute does not expose cancel', () => {
    const result = bakeBreadAction.execute(makeCtx())

    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('choice')
    const values = result.request.options.map((option) => option.value)
    expect(values).not.toContain('cancel')
    expect(values).toContain('Major_Fireplace1')
  })

  it('execute returns ok instead of an empty bake choice when no source is currently selectable', () => {
    const player = makePlayer({
      resources: { ...baseResources, grain: 0 },
      improvements: [],
    })

    const result = bakeBreadAction.execute(makeCtx(player))

    expect(result).toEqual({ type: 'ok' })
    expect(player.resources.grain).toBe(0)
    expect(player.resources.food).toBe(0)
  })

  it('cancel resolve fails without mutating state', () => {
    const player = makePlayer()
    const result = bakeBreadAction.resolveChoice!(makeCtx(player), 'cancel')

    expectNoBakeMutation(player, result)
  })

  it('empty bulk fails without mutating state', () => {
    const player = makePlayer()
    const result = bakeBreadAction.resolveChoice!(makeCtx(player), 'bulk:')

    expectNoBakeMutation(player, result)
  })

  it('malformed structured bake choices fail recoverably without mutating state', () => {
    const player = makePlayer()
    const result = bakeBreadAction.resolveChoice!(makeCtx(player), 'bulk:bad')

    expect(result).toMatchObject({
      type: 'fail',
      logKey: 'log.action',
      recoverable: true,
    })
    expect(player.resources.grain).toBe(3)
    expect(player.resources.food).toBe(0)
    expect(player.stats).toBeUndefined()
  })

  it('invalid bulk entries fail atomically', () => {
    const player = makePlayer()
    const result = bakeBreadAction.resolveChoice!(
      makeCtx(player),
      'bulk:Major_Fireplace1=1,NoSuchOven=1',
    )

    expectNoBakeMutation(player, result)
  })

  it('duplicate bulk source over aggregate max fails atomically', () => {
    const player = makePlayer()
    const result = bakeBreadAction.resolveChoice!(
      makeCtx(player),
      'bulk:Major_ClayOven=1,Major_ClayOven=1',
    )

    expectNoBakeMutation(player, result)
  })

  it('forged count choice over source max fails', () => {
    const player = makePlayer()
    const result = bakeBreadAction.resolveChoice!(makeCtx(player), 'count-Major_ClayOven-2')

    expectNoBakeMutation(player, result)
  })

  it('bulk over grain is atomic', () => {
    const player = makePlayer({ resources: { ...baseResources, grain: 1 } })
    const result = bakeBreadAction.resolveChoice!(
      makeCtx(player),
      'bulk:Major_Fireplace1=1,Major_ClayOven=1',
    )

    expectNoBakeMutation(player, result, 1)
  })

  it('valid bulk bakes at least one grain and records resources, stats, and logs', () => {
    const player = makePlayer()
    const result = bakeBreadAction.resolveChoice!(
      makeCtx(player),
      'bulk:Major_Fireplace1=1,Major_ClayOven=1',
    )

    expect(result.type).toBe('ok')
    if (result.type !== 'ok') return
    expect(player.resources.grain).toBe(1)
    expect(player.resources.food).toBe(7)
    expect(player.stats).toMatchObject({
      resourcesConverted: { grain: 2 },
      foodFromConversion: { grain: 7 },
    })
    expect(result.immediateLogs).toEqual([
      { key: 'log.bakeBread', params: { count: 1, food: 2 } },
      { key: 'log.bakeBread', params: { count: 1, food: 5 } },
    ])
  })
})
