import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { D67_ReapHook } from '../../cards-display/D/D67_ReapHook'

const CARD_ID = D67_ReapHook.id

export const D67_ReapHook_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 1 grain on each of the next 3 of rounds 4, 7, 9, 11, 13, 14
    const harvestRounds = [4, 7, 9, 11, 13, 14]
    const futureRounds = harvestRounds.filter((r) => r > state.round).slice(0, 3)
    if (futureRounds.length === 0) return
    const entries = futureRounds.map((round) => ({ round, resources: { grain: 1 } }))
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries,
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
