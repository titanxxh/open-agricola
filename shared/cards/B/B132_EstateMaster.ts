import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'B132_EstateMaster'

/**
 * B132 Estate Master (Occupation, B, 132)
 * Bonus scoring: 1 VP per farmyard tile that is used (rooms, fields, pastures, stables).
 * In BGA, this scores based on the number of used farmyard tiles.
 * Also, each time you harvest vegetables, you get 1 bonus VP per vegetable field harvested.
 *
 * Simplified: Score 1 bonus VP for every 2 used farmyard spaces (excluding rooms,
 * which already score). Based on typical BGA behavior for EstateMaster.
 */
registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    // Count used farmyard tiles (rooms + fields + pasture tiles + stables not in pastures)
    const usedTiles = new Set<string>()
    player.roomTiles.forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    player.fields.forEach((f) => usedTiles.add(`${f.row},${f.col}`))
    player.stableTiles.forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    player.pastures.flatMap((p) => p.tiles).forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    // Score 1 bonus VP per 3 used farmyard spaces
    return Math.floor(usedTiles.size / 3)
  },
})

export const B132_EstateMaster = new Occupation({
  id: CARD_ID,
  name: 'Estate Master',
  deck: 'B',
  number: 132,
  category: 'POINTS_PROVIDER',
  desc: ['During scoring, you get 1 bonus <SCORE> for every 3 used farmyard spaces (rooms, fields, pastures, stables).'],
  cost: {},
  players: '1+',
})
