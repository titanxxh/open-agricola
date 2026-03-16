import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { payGainFlow } from '../helpers/pay-gain-node'

const CARD_ID = 'A166_Haydryer'

registerCardEffect({
  id: CARD_ID,
  onBeforeHarvest: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const pastureCount = player.pastures.length
    const cost = Math.max(0, 4 - pastureCount)
    return payGainFlow({
      cardId: CARD_ID,
      cost: { food: cost },
      gain: { cattle: 1 },
      promptKey: 'ui.interactionHaydryer',
      markTrigger: true,
    })
  },
})

export const A166_Haydryer = new Occupation({
  id: CARD_ID,
  name: "Haydryer",
  deck: "A",
  number: 166,
  category: "LIVESTOCK_PROVIDER",
  desc: ["Before each harvest, you can pay (4 minus your pasture count) <FOOD> to get 1 <CATTLE>."],
  cost: {},
  players: "1+",
})
