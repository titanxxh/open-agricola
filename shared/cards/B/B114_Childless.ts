import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { B114_Childless } from '../../cards-display/B/B114_Childless'
export { B114_Childless }

const CARD_ID = B114_Childless.id

export const B114_Childless_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    const roomCount = player.roomTiles.length
    if (roomCount < 3) return
    if (familySize(player) !== 2) return
    return {
      type: 'xor',
      children: [
        {
          type: 'leaf',
          actionId: 'gain',
          params: { food: 1, grain: 1 },
          sourceCard: CARD_ID,
          choiceLabelKey: 'ui.interactionResourceExchange',
          choiceLabelParams: { resourcesGained: { food: 1, grain: 1 } },
        },
        {
          type: 'leaf',
          actionId: 'gain',
          params: { food: 1, vegetable: 1 },
          sourceCard: CARD_ID,
          choiceLabelKey: 'ui.interactionResourceExchange',
          choiceLabelParams: { resourcesGained: { food: 1, vegetable: 1 } },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
