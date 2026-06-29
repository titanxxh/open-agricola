import { describe, expect, it } from 'vitest'
import { collectComputeCostsForFarmChoice, collectFarmChoiceCostAdjustments } from '../card-listeners'
import type { GameState, PlayerState } from '../../contract/types'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  improvements: [],
  minorPlayed: [],
  occupationPlayed: [],
  cardStates: {},
  fenceSegments: [],
  ...overrides,
} as unknown as PlayerState)

const makeState = (player: PlayerState): GameState => ({
  players: [player],
} as unknown as GameState)

describe('collectComputeCostsForFarmChoice', () => {
  it('aggregates wood delta from E16 BriarHedge listener (Pass #2 with 2 border edges)', () => {
    const player = makePlayer({ minorPlayed: ['E016_BriarHedge'] })
    const state = makeState(player)
    const result = collectComputeCostsForFarmChoice(state, player, 'fence', {
      newFenceEdges: ['H-0-0', 'H-0-1'],
      newPalisadeEdges: [],
    })
    expect(result.wood).toBe(-2)
  })

  it('returns empty object when no listeners match', () => {
    const player = makePlayer()
    const state = makeState(player)
    const result = collectComputeCostsForFarmChoice(state, player, 'fence', {
      newFenceEdges: [],
      newPalisadeEdges: [],
    })
    expect(result.wood ?? 0).toBe(0)
  })

  it('aggregates trades and bonuses for farm-choice settlement', () => {
    const player = makePlayer({ minorPlayed: ['D082_HuntingTrophy'] })
    const state = makeState(player)
    const result = collectFarmChoiceCostAdjustments(
      state,
      player,
      'fence',
      { newFenceEdges: ['H-0-0'], newPalisadeEdges: [] },
      { id: 'farm-redevelopment' } as never,
    )
    expect(result.costs.wood ?? 0).toBe(0)
    expect(result.trades).toEqual([
      {
        from: {},
        to: { wood: 1 },
        max: 3,
        scope: 'action',
        sourceId: 'D082_HuntingTrophy',
      },
    ])
    expect(result.bonuses).toEqual([])
  })
})
