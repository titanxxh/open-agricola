import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { C44_ChickenCoop } from '../../cards-display/C/C44_ChickenCoop'
export { C44_ChickenCoop }

const CARD_ID = C44_ChickenCoop.id

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
