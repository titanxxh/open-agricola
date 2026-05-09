import type { CardImpl } from '../registry'
import { D35_FodderChamber } from '../../cards-display/D/D35_FodderChamber'

const CARD_ID = D35_FodderChamber.id

export const D35_FodderChamber_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    const totalAnimals = player.resources.sheep + player.resources.boar + player.resources.cattle
    const divisors = [7, 5, 4, 3, 3, 3]
    const divisor = divisors[state.players.length - 1] ?? 3
    return Math.floor(totalAnimals / divisor)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
