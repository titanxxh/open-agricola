import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E111_Recluse } from '../../cards-display/E/E111_Recluse'
export { E111_Recluse }

const CARD_ID = E111_Recluse.id

export const E111_Recluse_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (player.minorPlayed.length > 0) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
  onStartHarvest: (_state, player) => {
    if (player.minorPlayed.length > 0) return
    return gainLeaf(CARD_ID, { wood: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
