import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D11_LawnFertilizer'

// D11 Lawn Fertilizer: size-1 pastures hold up to 3 animals of the same type
// (with a stable, 6 animals). With A12 Drinking Trough, +2 more.
// BGA: in onPlayerComputeDropZones, capacity = 3 * (stables + 1), + 2 if A12 in play.
//
// Our A12 handler unconditionally adds +2 to every pasture. To match BGA's combined
// value exactly regardless of iteration order, we SET the size-1 pasture's capacity
// to the final BGA value here and mark the zone, and A12's handler leaves the
// pasture alone when it sees the marker. (See A12_DrinkingTrough for the skip.)
registerCardEffect({
  id: CARD_ID,
  onComputeAnimalZones: (player, zones) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    const hasA12 = player.minorPlayed.includes('A12_DrinkingTrough')
    for (const zone of zones) {
      if (zone.zoneType !== 'pasture' || zone.pastureIndex === undefined) continue
      const pasture = player.pastures[zone.pastureIndex]
      if (!pasture || pasture.size !== 1) continue
      zone.capacity = 3 * (pasture.stables + 1) + (hasA12 ? 2 : 0)
      ;(zone as unknown as { lawnFertilized?: boolean }).lawnFertilized = true
    }
  },
})

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
