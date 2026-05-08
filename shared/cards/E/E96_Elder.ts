import type { CardImpl } from '../registry'
import { E96_Elder } from '../../cards-display/E/E96_Elder'
export { E96_Elder }

const CARD_ID = E96_Elder.id

export const E96_Elder_impl = {
  effect: {
  id: CARD_ID,
  handHooks: ['onBeforeStartOfTurn'],
  onBeforeStartOfTurn: (state, _player) => {
    if (state.round !== 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'play-occupation',
          sourceCard: CARD_ID,
          params: { costOverride: {}, allowedCards: [CARD_ID] },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
