import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B148_PetBroker'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { sheep: 1 }),
  onComputeAnimalZones: (player, zones, _state) => {
    const occCount = player.occupationPlayed.length
    if (occCount === 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      capacity: occCount,
      animalType: 'sheep',
      animalCount: 0,
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B148_PetBroker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Pet Broker',
    deck: 'B',
    number: 148,
    desc: ['When you play this card, you immediately get 1 <SHEEP>. You can keep 1 <SHEEP> on this card for each occupation in front of you.'],
    cost: {},
    animalHolder: true,
    players: '4+',
    category: 'FARM_PLANNER',
  },
  impl: cardImpl,
})

export const B148_PetBroker_impl = B148_PetBroker.impl
