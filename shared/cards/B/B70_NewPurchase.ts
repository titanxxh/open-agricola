import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { stagePayGainFlow } from '../helpers/stage-effects'

const CARD_ID = 'B70_NewPurchase'
const harvestRounds = [4, 7, 9, 11, 13, 14]

registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (!harvestRounds.includes(state.round)) return
    return {
      type: 'seq',
      children: [
        stagePayGainFlow(CARD_ID, { food: 2 }, { grain: 1 }, 'ui.interactionNewPurchaseGrain'),
        stagePayGainFlow(CARD_ID, { food: 4 }, { vegetable: 1 }, 'ui.interactionNewPurchaseVegetable'),
      ],
    }
  },
})

export const B70_NewPurchase = new Occupation({
  id: CARD_ID,
  name: "New Purchase",
  deck: "B",
  number: 70,
  category: "CROP_PROVIDER",
  desc: ["Before each harvest round, you can pay 2 <FOOD> to get 1 <GRAIN>, and/or pay 4 <FOOD> to get 1 <VEGETABLE>."],
  cost: {},
  players: "1+",
})
