import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { payGainFlow } from '../helpers/pay-gain-node'

const CARD_ID = 'B70_NewPurchase'
const harvestRounds = [4, 7, 9, 11, 13, 14]

registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (state, _player) => {
    if (!harvestRounds.includes(state.round)) return
    return {
      type: 'seq',
      children: [
        payGainFlow({ cardId: CARD_ID, cost: { food: 2 }, gain: { grain: 1 }, promptKey: 'ui.interactionNewPurchaseGrain' }),
        payGainFlow({ cardId: CARD_ID, cost: { food: 4 }, gain: { vegetable: 1 }, promptKey: 'ui.interactionNewPurchaseVegetable' }),
      ],
    }
  },
})

export const B70_NewPurchase = new MinorImprovement({
  id: CARD_ID,
  name: "New Purchase",
  deck: "B",
  number: 70,
  category: "CROP_PROVIDER",
  desc: ['Before the start of each round that ends with a harvest, you can buy one of each of the following crops: 2 <FOOD> <ARROW> 1 <GRAIN>; 4 <FOOD> <ARROW> 1 <VEGETABLE>'],
  cost: {},
  players: "1+",
})
