import { defineMinorCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'D67_ReapHook'

const cardImpl = {
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

export const D67_ReapHook = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Reap Hook',
    deck: 'D',
    number: 67,
    category: 'CROP_PROVIDER',
    desc: ['Place 1 <GRAIN> on each of the next 3 of the round spaces 4, 7, 9, 11, 13, and 14. At the start of these rounds, you get the <GRAIN>.'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const D67_ReapHook_impl = D67_ReapHook.impl
