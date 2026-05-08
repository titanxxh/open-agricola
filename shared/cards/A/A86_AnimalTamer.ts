import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A86_AnimalTamer } from '../../cards-display/A/A86_AnimalTamer'
export { A86_AnimalTamer }

const CARD_ID = A86_AnimalTamer.id

export const A86_AnimalTamer_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'xor' as const,
    children: [
      gainLeaf(CARD_ID, { wood: 1 }),
      gainLeaf(CARD_ID, { grain: 1 }),
    ],
  }),
  onComputeAnimalZones: (player, zones) => {
    const houseZone = zones.find(z => z.zoneType === 'house')
    if (houseZone) {
      houseZone.capacity = player.rooms
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
