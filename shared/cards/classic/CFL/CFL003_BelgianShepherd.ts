import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getUnusedFarmyardTilePositions } from '../../../domain/farmyard-usage-core'
import { buildCardAnimalZoneId } from '../../../domain/animal-zones'

const CARD_ID = 'CFL003_BelgianShepherd'

const cardImpl = {
  prerequisiteCheck: (player) => player.resources.sheep >= 1,
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (player, zones) => {
      for (const position of getUnusedFarmyardTilePositions(player))
        zones.push({
          id: buildCardAnimalZoneId(CARD_ID, position),
          zoneType: 'card',
          cardId: CARD_ID,
          capacity: 2,
          allowedAnimalType: 'sheep',
          farmPosition: position,
          countsFarmyardSpaceAsUnused: true,
          displaySource: 'farm-position',
          occupancyGroup: CARD_ID,
          occupiedZoneLimit: 1,
        })
    },
  },
} satisfies CardImpl

export const CFL003_BelgianShepherd = defineMinorCard({
  meta: {
    id: 'CFL003_BelgianShepherd',
    name: 'Belgian Shepherd',
    deck: 'CFL',
    number: 3,
    vp: 1,
    desc: [
      'You can keep up to 2 <SHEEP> on at most one unused farmyard space. That space still counts as unused. You can no longer keep animals in your house.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL003.png',
    blocksHouseAnimalZones: true,
    animalHolder: true,
    prerequisite: '1 sheep',
  },
  impl: cardImpl,
})
