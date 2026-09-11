import { describe, expect, it } from 'vitest'
import { playMinor, setupMinorSession } from './_helpers/batch07-card-play'

import '../../shared/cards/A/A062_BeerKeg'

describe('A062 Beer Keg through Session', () => {
  it('requires two grain in supply without spending them', () => {
    const blocked = playMinor(setupMinorSession({
      cardId: 'A062_BeerKeg', resources: { wood: 1, grain: 1 },
    }), 'A062_BeerKeg')
    expect(blocked.state.players[0]!.minorPlayed).not.toContain('A062_BeerKeg')
    expect(blocked.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 1 })

    const played = playMinor(setupMinorSession({
      cardId: 'A062_BeerKeg', resources: { wood: 1, grain: 2 },
    }), 'A062_BeerKeg')
    expect(played.state.players[0]!.minorPlayed).toContain('A062_BeerKeg')
    expect(played.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 2 })
  })
})
