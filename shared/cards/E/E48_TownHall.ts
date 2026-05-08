import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E48_TownHall } from '../../cards-display/E/E48_TownHall'

const CARD_ID = E48_TownHall.id

export const E48_TownHall_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {

    if (player.houseType === 'clay') {
      return gainLeaf(CARD_ID, { food: 1 })
    }
    if (player.houseType === 'stone') {
      return gainLeaf(CARD_ID, { food: 2 })
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
