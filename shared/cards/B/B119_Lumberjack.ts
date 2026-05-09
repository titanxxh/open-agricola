import { gainLeaf } from '../helpers/pay-gain-node'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { getFenceCount } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'
import { B119_Lumberjack } from '../../cards-display/B/B119_Lumberjack'

const CARD_ID = B119_Lumberjack.id

export const B119_Lumberjack_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const fencesBuilt = getFenceCount(player)
    const children = [gainLeaf(CARD_ID, { wood: 1 })]
    if (fencesBuilt > 0) {
      children.push(
        queueFutureMeeplesFlow(state, {
          cardId: CARD_ID,
          playerId: player.id,
          startRound: state.round + 1,
          count: fencesBuilt,
          resources: { wood: 1 },
        }),
      )
    }
    return { type: 'seq' as const, children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
