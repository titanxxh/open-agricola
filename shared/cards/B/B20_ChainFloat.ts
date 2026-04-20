import { MinorImprovement } from '../types'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B20_ChainFloat'

export const B20_ChainFloat = new MinorImprovement({
  id: CARD_ID,
  name: 'Chain Float',
  deck: 'B',
  number: 20,
  category: 'FARM_PLANNER',
  desc: ['Add 7, 8, and 9 to the current round and place 1 field on each corresponding round space. At the start of these rounds, you can plow the field.'],
  cost: { wood: 3 },
})

export const B20_ChainFloat_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const base = state.round
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: base + 7, resources: {} },
        { round: base + 8, resources: {} },
        { round: base + 9, resources: {} },
      ],
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
