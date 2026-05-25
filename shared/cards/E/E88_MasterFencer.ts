import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E88_MasterFencer } from '../../cards-display/E/E88_MasterFencer'

const CARD_ID = E88_MasterFencer.id

const freeFencingLeaf = (max: number) => ({
  type: 'leaf' as const,
  actionId: 'fence',
  expandFlow: true,
  sourceCard: CARD_ID,
  actionContext: {
    trueAction: false,
    fencePolicy: {
      segmentBounds: { total: { min: 1, max } },
      costPolicy: { fence: { wood: 0 } },
      cancelPolicy: 'forbidCancel',
    },
  },
})

export const E88_MasterFencer_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (player.houseType !== 'stone') return

    const wood = player.resources.wood ?? 0
    if (wood < 2) return

    const options = []

    if (wood >= 2) {
      options.push({
        type: 'seq' as const,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { wood: 2 } }),
          freeFencingLeaf(3),
        ],
        choiceLabelKey: 'ui.interactionMasterFencer2',
      })
    }

    if (wood >= 3) {
      options.push({
        type: 'seq' as const,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { wood: 3 } }),
          freeFencingLeaf(4),
        ],
        choiceLabelKey: 'ui.interactionMasterFencer3',
      })
    }

    return { type: 'xor', optional: true, children: options }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
