import { collectCardsAs } from '../helpers/card-type'
import type { CardImpl } from '../registry'
import { A31_DebtSecurity } from '../../cards-display/A/A31_DebtSecurity'
export { A31_DebtSecurity }

const CARD_ID = A31_DebtSecurity.id

export const A31_DebtSecurity_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const usedTiles = new Set<string>()
    player.roomTiles.forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    player.fields.forEach((f) => usedTiles.add(`${f.row},${f.col}`))
    player.stableTiles.forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    player.pastures.flatMap((p) => p.tiles ?? []).forEach((t) => usedTiles.add(`${t.row},${t.col}`))
    const unusedSpaces = 15 - usedTiles.size
    return Math.min(collectCardsAs(player, 'major').length, unusedSpaces)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
