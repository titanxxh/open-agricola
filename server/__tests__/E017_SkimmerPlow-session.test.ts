import { describe, expect, it } from 'vitest'
import { setupSowingSession, sowCrops } from './_helpers/batch07-sowing'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/E/E017_SkimmerPlow'
import '../../shared/cards/D/D075_WoodField'
import '../../shared/cards/E/E080_RockGarden'

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

  it('places one fewer wood or stone on card fields sown', () => {
    const session = setupSowingSession({
      cardId: 'E017_SkimmerPlow', wood: 1, stone: 1,
    })
    session.state.players[0]!.minorPlayed.push('D075_WoodField', 'E080_RockGarden')
    session.loadState(session.state)

    const response = sowCrops(session, [
      { row: -1, col: 4075, crop: 'wood' },
      { row: -1, col: 5080, crop: 'stone' },
    ])

    expect(response.ok, response.error).toBe(true)
    expect(readCardExtraData(response.state.players[0]!, 'D075_WoodField', 'cardFieldStacks'))
      .toEqual([{ crop: 'wood', remaining: 2 }, null])
    expect(readCardExtraData(response.state.players[0]!, 'E080_RockGarden', 'cardFieldStacks'))
      .toEqual([{ crop: 'stone', remaining: 1 }, null, null])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })
  })
})
