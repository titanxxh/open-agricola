import { MinorImprovement } from '../types'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'C44_ChickenCoop'

export const C44_ChickenCoop = new MinorImprovement({
  id: CARD_ID,
  name: "Chicken Coop",
  deck: "C",
  number: 44,
  category: "FOOD_PROVIDER",
  desc: ["Place 1 <FOOD> on each of the next 8 round spaces. At the start of these rounds, you get the <FOOD>."],
  vp: 1,
  altCosts: [{ clay: 2, reed: 1 }, { wood: 2, reed: 1 }],
})

export const C44_ChickenCoop_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: 8,
      resources: { food: 1 },
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
