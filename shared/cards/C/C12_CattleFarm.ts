import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C12_CattleFarm'

registerCardEffect({
  id: CARD_ID,
  onComputeAnimalZones: (player, zones) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    const pastureCount = player.pastures.length
    if (pastureCount === 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      capacity: pastureCount,
      animalType: 'cattle',
      animalCount: 0,
    })
  },
})

export const C12_CattleFarm = new MinorImprovement({
  id: CARD_ID,
  name: 'Cattle Farm',
  deck: 'C',
  number: 12,
  category: 'FARMYARD_PLACE_FOR_ANIMALS',
  desc: ['For each pasture you have, you can keep 1 <CATTLE> on this card.'],
  cost: { wood: 1 },
})
