import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { C110_HomeBrewer } from '../../cards-display/C/C110_HomeBrewer'
export { C110_HomeBrewer }

const CARD_ID = C110_HomeBrewer.id

export const C110_HomeBrewer_impl = {
  effect: {
  id: CARD_ID,
  onEndHarvestFieldPhase: (_state, player) => {
    if (player.resources.grain < 1) return

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
          { type: 'leaf', actionId: 'pay', params: { grain: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { grain: 1 }, bonusVp: 1 },
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
