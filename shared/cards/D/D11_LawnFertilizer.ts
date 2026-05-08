import type { CardImpl } from '../registry'
import { D11_LawnFertilizer } from '../../cards-display/D/D11_LawnFertilizer'

const CARD_ID = D11_LawnFertilizer.id

export const D11_LawnFertilizer_impl = {
  effect: {
  id: CARD_ID,
  onComputeAnimalZones: (player, zones) => {
    const hasA12 = player.minorPlayed.includes('A12_DrinkingTrough')
    for (const zone of zones) {
      if (zone.zoneType !== 'pasture' || zone.pastureIndex === undefined) continue
      const pasture = player.pastures[zone.pastureIndex]
      if (!pasture || pasture.size !== 1) continue
      zone.capacity = 3 * (pasture.stables + 1) + (hasA12 ? 2 : 0)
      ;(zone as unknown as { lawnFertilized?: boolean }).lawnFertilized = true
    }
  },
},
  reaches: ['A12_DrinkingTrough'] as readonly string[],
} satisfies CardImpl
