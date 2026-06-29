import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A086_AnimalTamer'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'xor' as const,
    children: [
      gainLeaf(CARD_ID, { wood: 1 }),
      gainLeaf(CARD_ID, { grain: 1 }),
    ],
  }),
  onComputeAnimalZones: (player, zones, _state) => {
    const houseZone = zones.find(z => z.zoneType === 'house')
    if (houseZone) {
      houseZone.capacity = player.rooms
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A086_AnimalTamer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Animal Tamer',
    deck: 'A',
    number: 86,
    category: 'FARM_PLANNER',
    desc: ['When you play this card, you immediately get your choice of 1 <WOOD> or 1 <GRAIN>. Instead of just 1 animal total, you can keep any 1 animal in each room of your house.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const A086_AnimalTamer_impl = A086_AnimalTamer.impl
