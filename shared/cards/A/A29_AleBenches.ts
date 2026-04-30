import { MinorImprovement } from '../types'
import { payGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A29_AleBenches'

export const A29_AleBenches = new MinorImprovement({
  id: CARD_ID,
  name: "Ale-Benches",
  deck: "A",
  number: 29,
  category: "POINTS_PROVIDER",
  desc: ["In the returning home phase of each round, you can pay exactly 1 <GRAIN> from your supply to get 1 bonus <SCORE>. If you do, each other player gets 1 <FOOD>."],
  cost: {"wood":1},
  prerequisite: "2 Occupations",
  occupationPrerequisites: {"min":2},
  newSet: true,
  extraVp: true,
})

export const A29_AleBenches_impl = {
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
