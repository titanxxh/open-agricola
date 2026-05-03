import { describe, it, expect } from 'vitest'
import { applyRenovationAction } from '../apply-renovation'
import type {
  ActionExecutionContext,
  ActionSpace,
  GameState,
  PlayerState,
  Resource,
} from '../../../game/types'

const emptyResources = (): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
})

const makePlayer = (override: Partial<PlayerState> = {}): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    resources: emptyResources(),
    improvements: [],
    minorPlayed: [],
    minorHand: [],
    occupationHand: [],
    occupationPlayed: [],
    activeModifiers: [],
    cardStates: {},
    fields: [],
    pastures: [],
    roomTiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    stableTiles: [],
    stables: 0,
    rooms: 2,
    houseType: 'wood',
    workers: 2,
    ...override,
  } as unknown as PlayerState)

const makeState = (override: Partial<GameState> = {}): GameState =>
  ({
    players: [],
    currentPlayerIndex: 0,
    round: 1,
    actionSpaces: [],
    availableMajorImprovements: [],
    log: [],
    ...override,
  } as unknown as GameState)

const makeSpace = (id = 'renovate-house'): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    canBeExecutedByPlayer: () => true,
  } as unknown as ActionSpace)

const ctx = (
  player: PlayerState,
  state: GameState,
  params: unknown,
): ActionExecutionContext => ({
  state,
  player,
  space: makeSpace(),
  params: params as Record<string, unknown>,
  sourceCard: undefined,
  actionContext: {},
})

describe('applyRenovationAction', () => {
  it('exists with id "apply-renovation"', () => {
    expect(applyRenovationAction.id).toBe('apply-renovation')
  })

  it('wood → clay sets player.houseType', () => {
    const player = makePlayer({ houseType: 'wood' })
    const state = makeState()
    const result = applyRenovationAction.execute(
      ctx(player, state, { nextType: 'clay' }),
    )
    expect(result.type).toBe('ok')
    expect(player.houseType).toBe('clay')
  })

  it('clay → stone sets player.houseType', () => {
    const player = makePlayer({ houseType: 'clay' })
    const state = makeState()
    const result = applyRenovationAction.execute(
      ctx(player, state, { nextType: 'stone' }),
    )
    expect(result.type).toBe('ok')
    expect(player.houseType).toBe('stone')
  })

  it('returns fail when no params', () => {
    const player = makePlayer()
    const state = makeState()
    const result = applyRenovationAction.execute(ctx(player, state, undefined))
    expect(result.type).toBe('fail')
    expect(player.houseType).toBe('wood')
  })

  it('returns fail when nextType invalid', () => {
    const player = makePlayer({ houseType: 'wood' })
    const state = makeState()
    const result = applyRenovationAction.execute(
      ctx(player, state, { nextType: 'wood' }),
    )
    expect(result.type).toBe('fail')
    expect(player.houseType).toBe('wood')
  })
})
