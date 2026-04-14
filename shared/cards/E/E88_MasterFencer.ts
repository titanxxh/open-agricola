import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E88_MasterFencer'

// E88 Master Fencer: Once you live in a stone house, at the start of each round,
// you can pay 2 or 3 wood to build up to 3 or 4 fences, respectively.
registerCardEffect({
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
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
})

export const E88_MasterFencer = new Occupation({
  id: CARD_ID,
  name: 'Master Fencer',
  deck: 'E',
  number: 88,
  category: 'FARMYARD_FENCING',
  desc: ['Once you live in a stone house, at the start of each round, you can pay 2 or 3 <WOOD> to build up to 3 or 4 fences, respectively.'],
  cost: {},
  players: '1+',
})
