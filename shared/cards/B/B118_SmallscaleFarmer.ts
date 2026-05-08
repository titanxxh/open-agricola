import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B118_SmallscaleFarmer } from '../../cards-display/B/B118_SmallscaleFarmer'
export { B118_SmallscaleFarmer }

const CARD_ID = B118_SmallscaleFarmer.id

export const B118_SmallscaleFarmer_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    const roomCount = player.roomTiles.length
    if (roomCount !== 2) return
    return gainLeaf(CARD_ID, { wood: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
