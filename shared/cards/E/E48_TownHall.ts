import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E48_TownHall'

registerCardEffect({
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return

    if (player.houseType === 'clay') {
      return gainLeaf(CARD_ID, { food: 1 })
    }
    if (player.houseType === 'stone') {
      return gainLeaf(CARD_ID, { food: 2 })
    }
  },
})

export const E48_TownHall = new MinorImprovement({
  id: CARD_ID,
  name: "Town Hall",
  deck: "E",
  number: 48,
  category: "FOOD_PROVIDER",
  desc: ["In the feeding phase of each harvest, if you live in a clay or stone house, you get 1 or 2 <FOOD>, respectively."],
  vp: 2,
  cost: { wood: 2, clay: 2 },
})
