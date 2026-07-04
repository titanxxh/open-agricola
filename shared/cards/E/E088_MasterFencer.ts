import { defineOccupationCard } from '../card-source'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E088_MasterFencer'
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

const cardImpl = {
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

export const E088_MasterFencer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Master Fencer',
    deck: 'E',
    number: 88,
    category: 'FARMYARD_-_FENCING',
    desc: ['Once you live in a stone house, at the start of each round, you can pay 2 or 3 <WOOD> to build up to 3 or 4 <FENCE>, respectively.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const E088_MasterFencer_impl = E088_MasterFencer.impl
