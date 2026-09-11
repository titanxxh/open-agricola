import { describe, expect, it } from 'vitest'
import { setupSowingSession, sowCrops } from './_helpers/batch07-sowing'

import '../../shared/cards/E/E017_SkimmerPlow'

describe('E017 Skimmer Plow through Session', () => {
  it('places one fewer grain or vegetable on every field sown', () => {
    const session = setupSowingSession({ cardId: 'E017_SkimmerPlow', grain: 1, vegetable: 1 })
    session.state.players[0]!.fields = [
      { row: 0, col: 2, stacks: [] },
      { row: 1, col: 2, stacks: [] },
    ]
    session.loadState(session.state)
    const response = sowCrops(session, [
      { row: 0, col: 2, crop: 'grain' },
      { row: 1, col: 2, crop: 'vegetable' },
    ])
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields.map((field) => field.stacks[0]?.remaining)).toEqual([2, 1])
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
  })
})
