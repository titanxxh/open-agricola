import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D12_MilkingPlace } from '../../cards-display/D/D12_MilkingPlace'

const CARD_ID = D12_MilkingPlace.id

export const D12_MilkingPlace_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, _player) => {
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
