import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'B12_Stockyard'

/**
 * B12 Stockyard — This card can hold up to 3 animals of the same type.
 * (It is not considered a pasture.)
 *
 * BGA: onPlayerComputeDropZones adds a zone with capacity 3, any animal type.
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

export const B12_Stockyard = new MinorImprovement({
  id: CARD_ID,
  name: 'Stockyard',
  deck: 'B',
  number: 12,
  category: 'FARM_PLANNER',
  desc: ['This card can hold up to 3 animals of the same type. (It is not considered a pasture).'],
  cost: { wood: 1, stone: 1 },
  vp: 1,
  newSet: true,
})
