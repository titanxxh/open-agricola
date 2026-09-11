import { describe, expect, it } from 'vitest'
import { playMinor, setupMinorSession } from './_helpers/batch07-card-play'

import '../../shared/cards/A/A064_BarleyMill'

describe('A064 Barley Mill through Session', () => {
  it.each([
    { resources: { wood: 1, clay: 4 }, remaining: { wood: 0, clay: 0 } },
    { resources: { wood: 1, stone: 2 }, remaining: { wood: 0, stone: 0 } },
  ])('charges the shared wood in every cost', ({ resources, remaining }) => {
    const response = playMinor(setupMinorSession({ cardId: 'A064_BarleyMill', resources }), 'A064_BarleyMill')
    expect(response.state.players[0]!.minorPlayed).toContain('A064_BarleyMill')
    expect(response.state.players[0]!.resources).toMatchObject(remaining)
  })

  it('rejects play when the shared wood is missing', () => {
    const response = playMinor(setupMinorSession({
      cardId: 'A064_BarleyMill', resources: { clay: 4 },
    }), 'A064_BarleyMill')
    expect(response.state.players[0]!.minorPlayed).not.toContain('A064_BarleyMill')
    expect(response.state.players[0]!.resources.clay).toBe(4)
  })
})
