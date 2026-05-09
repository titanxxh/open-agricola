import type { CardImpl } from '../registry'
import { A99_FellowGrazer } from '../../cards-display/A/A99_FellowGrazer'

const CARD_ID = A99_FellowGrazer.id

export const A99_FellowGrazer_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return player.pastures.filter((p) => p.size >= 3).length * 2
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
