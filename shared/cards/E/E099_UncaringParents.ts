import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E099_UncaringParents'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onEndHarvest: (_state, player) => {
    if (player.houseType !== 'stone') return

    return {
      type: 'leaf',
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E099_UncaringParents = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Uncaring Parents",
    deck: "E",
    number: 99,
    category: "BONUS_POINTS_-_GET",
    desc: ["At the end of each harvest, if you live in a stone house, you get 1 bonus <SCORE>."],
    cost: {},
    players: "1+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const E099_UncaringParents_impl = E099_UncaringParents.impl
