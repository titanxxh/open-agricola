import { defineOccupationCard } from '../card-source'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'C166_CattleWhisperer'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const offsets = [5, 8]
    const entries = offsets
      .map((offset) => ({ round: state.round + offset, resources: { cattle: 1 } }))
      .filter((e) => e.round <= 14)
    if (entries.length === 0) return
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries,
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C166_CattleWhisperer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Cattle Whisperer",
    deck: "C",
    number: 166,
    category: "LIVESTOCK_PROVIDER",
    desc: ["Add 5 and 8 to the current round and place 1 <CATTLE> on each corresponding round space. At the start of these rounds, you get the <CATTLE>."],
    players: "4+",
  },
  impl: cardImpl,
})

export const C166_CattleWhisperer_impl = C166_CattleWhisperer.impl
