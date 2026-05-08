import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D12_MilkingPlace } from '../../cards-display/D/D12_MilkingPlace'
export { D12_MilkingPlace }

const CARD_ID = D12_MilkingPlace.id

export const D12_MilkingPlace_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, _player) => {
    return gainLeaf(CARD_ID, { food: 1 })
  },
  onComputeAnimalZones: (_player, zones) => {
    // BGA: filter house and D148_special — the player can no longer hold animals
    // in the house, even via another card (D148 DomesticianExpert).
    const houseIdx = zones.findIndex(z => z.zoneType === 'house')
    if (houseIdx !== -1) zones.splice(houseIdx, 1)
    const d148Idx = zones.findIndex(z => z.zoneType === 'card' && z.id === 'card:D148_DomesticianExpert')
    if (d148Idx !== -1) zones.splice(d148Idx, 1)
  },
},
  reaches: ['D148_DomesticianExpert'] as readonly string[],
} satisfies CardImpl
