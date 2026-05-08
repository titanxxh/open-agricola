import type { CardImpl } from '../registry'
import { A12_DrinkingTrough } from '../../cards-display/A/A12_DrinkingTrough'

const CARD_ID = A12_DrinkingTrough.id

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
