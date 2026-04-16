import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A86_AnimalTamer'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'xor' as const,
    children: [
      gainLeaf(CARD_ID, { wood: 1 }),
      gainLeaf(CARD_ID, { grain: 1 }),
    ],
  }),
  onComputeAnimalZones: (player, zones) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const houseZone = zones.find(z => z.zoneType === 'house')
    if (houseZone) {
      houseZone.capacity = player.rooms
    }
  },
})

export const A86_AnimalTamer = new Occupation({
  id: CARD_ID,
  name: 'Animal Tamer',
  deck: 'A',
  number: 86,
  category: 'FARMYARD_-_PLACE_FOR_ANIMALS',
  desc: ['When you play this card, you immediately get your choice of 1 <WOOD> or 1 <GRAIN>. Instead of just 1 animal total, you can keep any 1 animal in each room of your house.'],
  cost: {},
  players: '1+',
})
