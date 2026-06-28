import { defineMinorCard } from '../card-source'
import { payGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A029_AleBenches'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onReturnHome: (_state, player) => {
    if (player.resources.grain < 1) return
    return payGainFlow({
      cardId: CARD_ID,
      cost: { grain: 1 },
      gain: { score: 1 },
      promptKey: 'ui.interactionAleBenches',
      followUp: [
        { type: 'leaf', actionId: 'gain', params: { recipientMode: 'others', food: 1 }, sourceCard: CARD_ID },
      ],
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A029_AleBenches = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Ale-Benches",
    deck: "A",
    number: 29,
    category: "POINTS_PROVIDER",
    desc: ["In the returning home phase of each round, you can pay exactly 1 <GRAIN> from your supply to get 1 bonus <SCORE>. If you do, each other player gets 1 <FOOD>."],
    cost: {"wood":1},
    prerequisite: "2 Occupations",
    occupationPrerequisites: {"min":2},
    extraVp: true,
  },
  impl: cardImpl,
})

export const A029_AleBenches_impl = A029_AleBenches.impl
