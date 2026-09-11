import { describe, expect, it } from 'vitest'
import { setupSowingSession, sowCrops } from './_helpers/batch07-sowing'

import '../../shared/cards/E/E050_WildGreens'

describe('E050 Wild Greens through Session', () => {
  it('rewards each different crop type once, including repeated grain sowing', () => {
    const mixed = setupSowingSession({ cardId: 'E050_WildGreens', grain: 1, vegetable: 1 })
    mixed.state.players[0]!.fields = [
      { row: 0, col: 2, stacks: [] },
      { row: 1, col: 2, stacks: [] },
    ]
    mixed.loadState(mixed.state)
    const mixedResponse = sowCrops(mixed, [
      { row: 0, col: 2, crop: 'grain' },
      { row: 1, col: 2, crop: 'vegetable' },
    ])
    expect(mixedResponse.state.players[0]!.resources.food).toBe(2)

    const repeated = setupSowingSession({ cardId: 'E050_WildGreens', grain: 2 })
    repeated.state.players[0]!.fields = [
      { row: 0, col: 2, stacks: [] },
      { row: 1, col: 2, stacks: [] },
    ]
    repeated.loadState(repeated.state)
    const repeatedResponse = sowCrops(repeated, [
      { row: 0, col: 2, crop: 'grain' },
      { row: 1, col: 2, crop: 'grain' },
    ])
    expect(repeatedResponse.state.players[0]!.resources.food).toBe(1)
  })
})
