import { Occupation } from '../types'
import { payLeaf } from '../helpers/pay-gain-node'
import { familySize } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'E102_Acquirer'

export const E102_Acquirer = new Occupation({
  id: CARD_ID,
  name: 'Acquirer',
  deck: 'E',
  number: 102,
  category: 'GOODS_GET',
  desc: ['At the start of each round, you can pay <FOOD> equal to the number of people you have to buy 1 good of your choice from the general supply.'],
  cost: {},
  players: '1+',
})

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
            choiceLabelKey: 'ui.interactionResourceExchange',
            choiceLabelParams: { resourcesGained: { [good]: 1 } },
          })),
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
