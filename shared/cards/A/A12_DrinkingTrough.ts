import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A12_DrinkingTrough'

registerCardEffect({
  id: CARD_ID,
  onComputeAnimalZones: (player, zones) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    for (const zone of zones) {
      if (zone.zoneType === 'pasture') {
        zone.capacity += 2
      }
    }
  },
})

export const A12_DrinkingTrough = new MinorImprovement({
  id: CARD_ID,
  name: "Drinking Trough",
  deck: "A",
  number: 12,
  category: "FARM_PLANNER",
  desc: ["Each of your pastures (with or without a stable) can hold up to 2 more animals."],
  cost: { clay: 1 },
})
