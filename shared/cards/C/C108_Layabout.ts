import { defineOccupationCard } from '../card-source'
import { scheduleNextHarvestSkip } from '../helpers/harvest-skip'
import type { CardImpl } from '../registry'

const CARD_ID = 'C108_Layabout'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    scheduleNextHarvestSkip(player, CARD_ID)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C108_Layabout = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Layabout",
    deck: "C",
    number: 108,
    category: "FOOD_PROVIDER",
    desc: ["When you play this card, you must skip the next harvest. (You also do not have to feed your family that harvest.)"],
    players: "1+",
  },
  impl: cardImpl,
})

export const C108_Layabout_impl = C108_Layabout.impl
