import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B148_PetBroker } from '../../cards-display/B/B148_PetBroker'

const CARD_ID = B148_PetBroker.id

export const B148_PetBroker_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { sheep: 1 }),
  onComputeAnimalZones: (player, zones) => {
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
