import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'A118_Treegardener'

registerCardEffect({
  id: CARD_ID,
  onHarvestFieldPhase: (_state, _player) => {

    const children: ActionFlow[] = [
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { food: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: CARD_ID },
        ],
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { food: 1 }, resourcesGained: { wood: 1 } },
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { food: 2 }, sourceCard: CARD_ID },
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
})

export const A118_Treegardener = new Occupation({
  id: CARD_ID,
  name: "Treegardener",
  deck: "A",
  number: 118,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["In the field phase of each harvest, you get 1 <WOOD> and you can buy up to 2 additional <WOOD> for 1 <FOOD> each."],
  cost: {},
  players: "1+",
})
