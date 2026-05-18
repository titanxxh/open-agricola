import { describe, it, expect } from 'vitest'
import { applyImprovementAction } from '../apply-improvement'
import type {
  ActionExecutionContext,
  ActionSpace,
  GameState,
  PlayerState,
  Resource,
} from '../../../contract/types'

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
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
    ],
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

const makeSpace = (id = 'improvement'): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    canBeExecutedByPlayer: () => true,
  } as unknown as ActionSpace)

const ctx = (player: PlayerState, state: GameState, params: unknown): ActionExecutionContext => ({
  state,
  player,
  space: makeSpace(),
  params: params as Record<string, unknown>,
  sourceCard: undefined,
  actionContext: {},
})

describe('applyImprovementAction', () => {
  it('exists with id "apply-improvement"', () => {
    expect(applyImprovementAction.id).toBe('apply-improvement')
  })

  it('major: pushes improvement id into player.improvements + drops from availableMajorImprovements', () => {
    const player = makePlayer()
    const state = makeState({ availableMajorImprovements: ['Major_Fireplace1', 'Major_StoneOven'] })
    const result = applyImprovementAction.execute(
      ctx(player, state, { improvementId: 'Major_Fireplace1', kind: 'major' }),
    )
    expect(result.type === 'ok' || result.type === 'flow').toBe(true)
    expect(player.improvements).toContain('Major_Fireplace1')
    expect(state.availableMajorImprovements).not.toContain('Major_Fireplace1')
  })

  it('minor: moves card from minorHand to minorPlayed', () => {
    const player = makePlayer({ minorHand: ['A4_Baseboards', 'OtherMinor'] })
    const state = makeState()
    const result = applyImprovementAction.execute(
      ctx(player, state, { improvementId: 'A4_Baseboards', kind: 'minor' }),
    )
    expect(result.type === 'ok' || result.type === 'flow').toBe(true)
    expect(player.minorHand).not.toContain('A4_Baseboards')
    expect(player.minorPlayed).toContain('A4_Baseboards')
  })

  it('returns fail when no params', () => {
    const player = makePlayer()
    const state = makeState()
    const result = applyImprovementAction.execute(ctx(player, state, undefined))
    expect(result.type).toBe('fail')
  })
})
