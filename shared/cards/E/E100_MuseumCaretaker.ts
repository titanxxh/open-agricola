import type { CardImpl } from '../registry'
import { E100_MuseumCaretaker } from '../../cards-display/E/E100_MuseumCaretaker'
export { E100_MuseumCaretaker }

const CARD_ID = E100_MuseumCaretaker.id

export const E100_MuseumCaretaker_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    const r = player.resources
    if (
      (r.wood ?? 0) >= 1 &&
      (r.clay ?? 0) >= 1 &&
      (r.reed ?? 0) >= 1 &&
      (r.stone ?? 0) >= 1 &&
      (r.grain ?? 0) >= 1 &&
      (r.vegetable ?? 0) >= 1
    ) {
      return { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID }
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
