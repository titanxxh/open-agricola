import { Occupation } from '../types'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E88_MasterFencer'

export const E88_MasterFencer = new Occupation({
  id: CARD_ID,
  name: 'Master Fencer',
  deck: 'E',
  number: 88,
  category: 'FARMYARD_-_FENCING',
  desc: ['Once you live in a stone house, at the start of each round, you can pay 2 or 3 <WOOD> to build up to 3 or 4 fences, respectively.'],
  cost: {},
  players: '1+',
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
          { type: 'leaf' as const, actionId: 'fencing', params: { maxFences: 3, freeFencing: true }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionMasterFencer2',
      })
    }

    if (wood >= 3) {
      options.push({
        type: 'seq' as const,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { wood: 3 } }),
          { type: 'leaf' as const, actionId: 'fencing', params: { maxFences: 4, freeFencing: true }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionMasterFencer3',
      })
    }

    return { type: 'xor', optional: true, children: options }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
