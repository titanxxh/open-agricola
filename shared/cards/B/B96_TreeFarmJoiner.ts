import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { B96_TreeFarmJoiner } from '../../cards-display/B/B96_TreeFarmJoiner'

const CARD_ID = B96_TreeFarmJoiner.id

export const B96_TreeFarmJoiner_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const cur = state.round
    // Find next 2 odd round numbers > current
    const oddRounds: number[] = []
    for (let r = cur + 1; r <= 14 && oddRounds.length < 2; r++) {
      if (r % 2 !== 0) oddRounds.push(r)
    }
    if (oddRounds.length === 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: oddRounds.map((round) => ({ round, resources: { wood: 1 } })),
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
