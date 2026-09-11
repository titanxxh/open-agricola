import { describe, expect, it } from 'vitest'
import { playMinor, setupMinorSession } from './_helpers/batch07-card-play'

import '../../shared/cards/D/D033_SummerHouse'

describe('D033 Summer House through Session', () => {
  it.each(['clay', 'stone'] as const)('rejects play in a %s house', (houseType) => {
    const response = playMinor(setupMinorSession({
      cardId: 'D033_SummerHouse', resources: { wood: 3, stone: 1 }, houseType,
    }), 'D033_SummerHouse')
    expect(response.state.players[0]!.minorPlayed).not.toContain('D033_SummerHouse')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, stone: 1 })
  })

  it('allows play while the player still lives in wood', () => {
    const response = playMinor(setupMinorSession({
      cardId: 'D033_SummerHouse', resources: { wood: 3, stone: 1 }, houseType: 'wood',
    }), 'D033_SummerHouse')
    expect(response.state.players[0]!.minorPlayed).toContain('D033_SummerHouse')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })
  })
})
