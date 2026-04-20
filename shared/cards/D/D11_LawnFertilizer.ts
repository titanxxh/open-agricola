import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D11_LawnFertilizer'

export const D11_LawnFertilizer = new MinorImprovement({
  id: CARD_ID,
  name: 'Lawn Fertilizer',
  deck: 'D',
  number: 11,
  category: 'FARM_PLANNER',
  desc: ['Your pastures of size 1 can hold up to 3 animals of the same type. (With a stable, they can hold up to 6 animals of the same type.)'],
  cost: {},
  newSet: true,
})

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
  reaches: [] as readonly string[],
} satisfies CardImpl
