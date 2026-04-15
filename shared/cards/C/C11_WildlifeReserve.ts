import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C11_WildlifeReserve'

/**
 * C11 Wildlife Reserve — This card can hold up to 1 sheep, 1 pig, and 1 cattle.
 *
 * Uses a single zone with capacity 3 and any animal type. The per-type limit
 * (max 1 of each) is a validation concern during animal reorganization.
 */
registerCardEffect({
  id: CARD_ID,
  onComputeAnimalZones: (player, zones) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      capacity: 3,
      animalType: null,
      animalCount: 0,
    })
  },
})

export const C11_WildlifeReserve = new MinorImprovement({
  id: CARD_ID,
  name: 'Wildlife Reserve',
  deck: 'C',
  number: 11,
  category: 'FARMYARD_-_PLACE_FOR_ANIMALS',
  desc: ['This card can hold up to 1 <SHEEP>, 1 <PIG>, and 1 <CATTLE>.'],
  cost: { wood: 2 },
  vp: 1,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
