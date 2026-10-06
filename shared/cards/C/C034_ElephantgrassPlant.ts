import { defineMinorCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C034_ElephantgrassPlant'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onAfterHarvest: (_state, player) => {
    if (player.resources.reed < 1) return

    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'pay', params: { reed: 1 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
      ],
    } satisfies ActionFlow
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C034_ElephantgrassPlant = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Elephantgrass Plant",
    deck: "C",
    number: 34,
    category: "POINTS_PROVIDER",
    desc: ["Immediately after each harvest, you can use this card to exchange exactly 1 <REED> for 1 bonus <SCORE>."],
    cost: { clay: 2, stone: 1 },
    prerequisite: "2 Occupations",
    occupationPrerequisites: { min: 2 },
    extraVp: true,
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const C034_ElephantgrassPlant_impl = C034_ElephantgrassPlant.impl
