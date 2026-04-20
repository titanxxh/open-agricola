import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B11_Feedyard'

export const B11_Feedyard = new MinorImprovement({
  id: CARD_ID,
  name: 'Feedyard',
  deck: 'B',
  number: 11,
  category: 'FARMYARD_-_PLACE_FOR_ANIMALS',
  desc: ['This card can hold 1 animal for each pasture you have, even different types. After the breeding phase of each harvest, you get 1 <FOOD> for each unused spot on this card.'],
  cost: { clay: 1, grain: 1 },
  vp: 1,
})

export const B11_Feedyard_impl = {
  effect: {
  id: CARD_ID,
  onComputeAnimalZones: (player, zones) => {
    const pastureCount = player.pastures.length
    if (pastureCount === 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      capacity: pastureCount,
      animalType: null,
      animalCount: 0,
    })
  },
  // TODO: onEndHarvest — grant 1 food per unused spot on this card zone
  // (capacity - animalCount). Needs a way to read assigned animal count
  // from the card zone after breeding.
},
  reaches: [] as readonly string[],
} satisfies CardImpl
