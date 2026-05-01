import { Occupation } from '../types'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'C118_WoodCollector'

export const C118_WoodCollector = new Occupation({
  id: CARD_ID,
  name: "Wood Collector",
  deck: "C",
  number: 118,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Place 1 <WOOD> on each of the next 5 round spaces. At the start of these rounds, you get the <WOOD>."],
  players: "1+",
})

export const C118_WoodCollector_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: 5,
      resources: { wood: 1 },
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
