import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'D107_Bellfounder'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (_state, player) => {
    const allClay = player.resources.clay ?? 0
    if (allClay < 1) return
    return {
      type: 'xor',
      optional: true,
      promptKey: 'ui.interactionBellfounder',
      children: [
        {
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'pay', params: { clay: allClay }, sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'gain', params: { food: 3 }, sourceCard: CARD_ID },
          ],
        },
        {
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'pay', params: { clay: allClay }, sourceCard: CARD_ID },
            { type: 'leaf', actionId: 'bonus-vp', params: {}, sourceCard: CARD_ID },
          ],
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D107_Bellfounder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Bellfounder",
    deck: "D",
    number: 107,
    category: "FOOD_PROVIDER",
    desc: ["In the returning home phase of each round, if you have at least 1 <CLAY>, you can use this card to discard all of your <CLAY> and get your choice of 3 <FOOD> or 1 bonus <SCORE>."],
    cost: {},
    players: "1+",
    extraVp: true,
    waresSalesmanGains: [{ clay: 1, reed: 1 }],
  },
  impl: cardImpl,
})

export const D107_Bellfounder_impl = D107_Bellfounder.impl
