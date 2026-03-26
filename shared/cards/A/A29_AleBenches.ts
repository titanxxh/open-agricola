import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A29_AleBenches'

registerCardEffect({
  id: CARD_ID,
  onReturnHome: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    if (player.resources.grain < 1) return
    return {
      type: 'seq',
      optional: true,
      promptKey: 'ui.interactionAleBenches',
      children: [
        { type: 'leaf', actionId: 'pay-resources', params: { grain: 1 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'gain-other-players', params: { food: 1 }, sourceCard: CARD_ID },
      ],
    }
  },
})

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
})
