import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B148_PetBroker'

export const B148_PetBroker = new Occupation({
  id: CARD_ID,
  name: 'Pet Broker',
  deck: 'B',
  number: 148,
  desc: ['When you play this card, you immediately get 1 <SHEEP>. You can keep 1 <SHEEP> on this card for each occupation in front of you.'],
  cost: {},
  players: '4+',
})

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
