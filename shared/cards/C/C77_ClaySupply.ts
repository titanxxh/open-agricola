import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { C77_ClaySupply } from '../../cards-display/C/C77_ClaySupply'

const CARD_ID = C77_ClaySupply.id

export const C77_ClaySupply_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: 3,
      resources: { clay: 1 },
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
