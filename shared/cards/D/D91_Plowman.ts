import { defineOccupationCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'D91_Plowman'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const offsets = [4, 7, 10]
    const targetRounds = offsets
      .map((offset) => state.round + offset)
      .filter((r) => r <= 14)
    if (targetRounds.length === 0) return
    const entries = targetRounds.map((round) => ({
      round,
      resources: { field: 1 },
      actionContext: { exactCost: { food: 1 } },
    }))
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries,
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D91_Plowman = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Plowman',
    deck: 'D',
    number: 91,
    category: 'FARM_PLANNER',
    desc: ['Add 4, 7, and 10 to the current round and place a field tile on each corresponding round space. At the start of these rounds, you can plow the field for 1 <FOOD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D91_Plowman_impl = D91_Plowman.impl
