import { defineMinorCard } from '../card-source'
import { buildHostedCardAnimalZoneId, type AnimalZone } from '../../domain/animal-zones'
import type { CardImpl } from '../registry'

const CARD_ID = 'M033_NightPasture'

const nightPastureZone = (
  ownerPlayerId: string,
  animalOwnerPlayerId: string,
  capacity: number,
  displaySource: AnimalZone['displaySource'],
  displayOwnerName?: string,
): AnimalZone => ({
  id: buildHostedCardAnimalZoneId(CARD_ID, ownerPlayerId, animalOwnerPlayerId),
  zoneType: 'card',
  cardId: CARD_ID,
  ownerPlayerId,
  animalOwnerPlayerId,
  breedingOwnerPlayerId: ownerPlayerId,
  ...(displayOwnerName ? { displayOwnerName } : {}),
  displaySource,
  capacity,
  allowedAnimalType: null,
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (owner) => [
      nightPastureZone(owner.id, owner.id, 3, 'played-card'),
    ],
    onComputeSharedAnimalZones: (owner, animalOwner) => {
      if (owner.id === animalOwner.id) return
      return [nightPastureZone(owner.id, animalOwner.id, 1, 'borrowed-played-card', owner.name)]
    },
    computeHarvestBreedOrderPriority: () => 1,
  },
} satisfies CardImpl

export const M033_NightPasture = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Night Pasture",
    deck: "M",
    number: 33,
    category: "FARM_PLANNER",
    desc: [
        "You can keep up to 3 animals of any type on this card; the other players can each keep an additional 1 animal on it. The animals on this card count as only yours when animals breed. You are always the last player to breed in the breeding phase."
    ],
    cost: {
        "clay": 2
    },
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M033_NightPasture_impl = M033_NightPasture.impl
