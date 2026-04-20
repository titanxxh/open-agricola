import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A12_DrinkingTrough'

export const A12_DrinkingTrough = new MinorImprovement({
  id: CARD_ID,
  name: "Drinking Trough",
  deck: "A",
  number: 12,
  category: "FARM_PLANNER",
  desc: ["Each of your pastures (with or without a stable) can hold up to 2 more animals."],
  cost: { clay: 1 },
})

export const A12_DrinkingTrough_impl = {
  effect: {
  id: CARD_ID,
  onComputeAnimalZones: (_player, zones) => {
    for (const zone of zones) {
      if (zone.zoneType === 'pasture') {
        // D11_LawnFertilizer already computed the combined capacity for size-1
        // pastures (BGA matches A12 into its own formula). Skip to avoid double-add.
        if ((zone as unknown as { lawnFertilized?: boolean }).lawnFertilized) continue
        zone.capacity += 2
      }
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
