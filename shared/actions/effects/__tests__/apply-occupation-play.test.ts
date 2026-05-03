import { describe, it, expect } from 'vitest'
import { applyOccupationPlayAction } from '../apply-occupation-play'
import '../../../cards/A/A100_Curator'
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

const makeSpace = (id = 'lessons'): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    canBeExecutedByPlayer: () => true,
  } as unknown as ActionSpace)

const ctx = (
  player: PlayerState,
  state: GameState,
  params: unknown,
  space: ActionSpace = makeSpace(),
): ActionExecutionContext => ({
  state,
  player,
  space,
  params: params as Record<string, unknown>,
  sourceCard: undefined,
  actionContext: {},
})

describe('applyOccupationPlayAction', () => {
  it('exists with id "apply-occupation-play"', () => {
    expect(applyOccupationPlayAction.id).toBe('apply-occupation-play')
  })

  it('moves the occupation from hand to played list', () => {
    const player = makePlayer({ occupationHand: ['A100_Curator', 'A101_CookeryOutfitter'] })
    const state = makeState()
    const result = applyOccupationPlayAction.execute(
      ctx(player, state, {
        occupationId: 'A100_Curator',
        suppressOnBuyEffects: true,
      }),
    )
    expect(result.type === 'ok' || result.type === 'flow').toBe(true)
    expect(player.occupationHand).not.toContain('A100_Curator')
    expect(player.occupationPlayed).toContain('A100_Curator')
  })

  it('suppressOnBuyEffects=true skips card activation but still pushes the card', () => {
    const player = makePlayer({ occupationHand: ['A100_Curator'] })
    const state = makeState()
    const result = applyOccupationPlayAction.execute(
      ctx(player, state, {
        occupationId: 'A100_Curator',
        suppressOnBuyEffects: true,
      }),
    )
    expect(result.type).toBe('ok')
    expect(player.occupationPlayed).toContain('A100_Curator')
  })

  it('returns fail when no params', () => {
    const player = makePlayer({ occupationHand: ['A100_Curator'] })
    const state = makeState()
    const result = applyOccupationPlayAction.execute(ctx(player, state, undefined))
    expect(result.type).toBe('fail')
    expect(player.occupationPlayed).not.toContain('A100_Curator')
  })

  it('returns fail when occupationId missing', () => {
    const player = makePlayer({ occupationHand: ['A100_Curator'] })
    const state = makeState()
    const result = applyOccupationPlayAction.execute(ctx(player, state, { suppressOnBuyEffects: true }))
    expect(result.type).toBe('fail')
  })
})
