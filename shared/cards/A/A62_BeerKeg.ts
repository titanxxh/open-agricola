import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { A62_BeerKeg } from '../../cards-display/A/A62_BeerKeg'
export { A62_BeerKeg }

const CARD_ID = A62_BeerKeg.id

export const A62_BeerKeg_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, _player) => {

    const children: ActionFlow[] = [
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { grain: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 3 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { grain: 1 }, resourcesGained: { food: 3 } },
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { grain: 2 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 3 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { grain: 2 }, resourcesGained: { food: 3 }, bonusVp: 1 },
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { grain: 3 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 3 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { grain: 3 }, resourcesGained: { food: 3 }, bonusVp: 2 },
      },
    ]

    return {
      type: 'xor',
      optional: true,
      children,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
