import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { B82_ValueAssets } from '../../cards-display/B/B82_ValueAssets'

const CARD_ID = B82_ValueAssets.id

export const B82_ValueAssets_impl = {
  effect: {
  id: CARD_ID,
  onAfterHarvest: (_state, _player) => {

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
          { type: 'leaf', actionId: 'pay', params: { food: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { clay: 1 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { food: 1 }, resourcesGained: { clay: 1 } },
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { food: 2 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { reed: 1 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { food: 2 }, resourcesGained: { reed: 1 } },
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { food: 2 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { stone: 1 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { food: 2 }, resourcesGained: { stone: 1 } },
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
