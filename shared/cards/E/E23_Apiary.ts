import type { CardImpl } from '../registry'
import { E23_Apiary } from '../../cards-display/E/E23_Apiary'
export { E23_Apiary }

const CARD_ID = E23_Apiary.id

export const E23_Apiary_impl = {
  effect: {
  id: CARD_ID,
  onBeforeReturnHome: (_state, player) => {
    if (player.fields.length === 0) return
    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'sow', params: { max: 1 }, sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
