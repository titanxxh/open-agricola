import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { A118_Treegardener } from '../../cards-display/A/A118_Treegardener'

const CARD_ID = A118_Treegardener.id

export const A118_Treegardener_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFieldPhase: (_state, _player) => {

    const children: ActionFlow[] = [
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { food: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { food: 1 }, resourcesGained: { wood: 1 } },
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { food: 2 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { wood: 2 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { food: 2 }, resourcesGained: { wood: 2 } },
      },
    ]

    return {
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: CARD_ID },
        {
          type: 'xor',
          optional: true,
          children,
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
