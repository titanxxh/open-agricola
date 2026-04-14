import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E94_Prophet'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'seq' as const,
    children: [
      {
        type: 'leaf' as const,
        actionId: 'renovation',
        sourceCard: CARD_ID,
      },
      {
        type: 'leaf' as const,
        actionId: 'fencing',
        sourceCard: CARD_ID,
        optional: true,
      },
    ],
  }),
})

export const E94_Prophet = new Occupation({
  id: CARD_ID,
  name: 'Prophet',
  deck: 'E',
  number: 94,
  category: 'FARM_BUILDER',
  desc: ['When you play this card, immediately take a __Renovation__ action. Afterward, you can take a __Build Fences__ action. (Both actions require their usual cost.)'],
  players: '1+',
})
