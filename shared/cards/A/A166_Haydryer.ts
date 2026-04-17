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
    })
  },
})

export const A166_Haydryer = new Occupation({
  id: CARD_ID,
  name: "Haydryer",
  deck: "A",
  number: 166,
  category: "LIVESTOCK_PROVIDER",
  desc: ["Immediately before each harvest, you can buy 1 <CATTLE> for 4 <FOOD> minus 1 <FOOD> for each pasture you have. (The minimum cost is 0)."],
  cost: {},
  players: "4+",
})
