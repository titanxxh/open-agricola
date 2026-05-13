import { payLeaf } from '../helpers/pay-gain-node'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { E102_Acquirer } from '../../cards-display/E/E102_Acquirer'

const CARD_ID = E102_Acquirer.id

export const E102_Acquirer_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    const n = familySize(player)
    if ((player.resources.food ?? 0) < n) return

    const goodChoices = ['vegetable', 'grain', 'cattle', 'sheep', 'boar', 'wood', 'clay', 'reed', 'stone'] as const
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: n } }),
        {
          type: 'xor',
          children: goodChoices.map((good) => ({
            type: 'leaf' as const,
            actionId: 'gain',
            params: { [good]: 1 },
            sourceCard: CARD_ID,
          })),
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
