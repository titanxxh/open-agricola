import type { CardImpl } from '../registry'
import { E26_Sundial } from '../../cards-display/E/E26_Sundial'
export { E26_Sundial }

const CARD_ID = E26_Sundial.id

const TRIGGER_ROUNDS = new Set([7, 9])

export const E26_Sundial_impl = {
  effect: {
  id: CARD_ID,
  onBeforeReturnHome: (state, player) => {
    if (!TRIGGER_ROUNDS.has(state.round)) return
    if (player.fields.length === 0) return
    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'sow', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
