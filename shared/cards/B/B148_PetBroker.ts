import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B148_PetBroker'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { sheep: 1 }),
  onComputeAnimalZones: (player, zones) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
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
})

export const B148_PetBroker = new Occupation({
  id: CARD_ID,
  name: 'Pet Broker',
  deck: 'B',
  number: 148,
  desc: ['When you play this card, you immediately get 1 <SHEEP>. You can keep 1 <SHEEP> on this card for each occupation in front of you.'],
  cost: {},
  players: '4+',
})
