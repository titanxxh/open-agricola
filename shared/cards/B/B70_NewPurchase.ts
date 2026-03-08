import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'B70_NewPurchase'
const harvestRounds = [4, 7, 9, 11, 13, 14]

registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (!harvestRounds.includes(state.round)) return
    if (player.resources.food >= 2) {
      player.resources.food -= 2
      player.resources.grain += 1
      incCounter(player, CARD_ID, 'triggerCount')
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
