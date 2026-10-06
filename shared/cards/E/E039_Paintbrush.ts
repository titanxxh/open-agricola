import { defineMinorCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E039_Paintbrush'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {
    if (player.resources.clay < 1) return

    const children: ActionFlow[] = [
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { clay: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: CARD_ID },
        ],
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { clay: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
        ],
      },
    ]

    return {
      type: 'xor',
      optional: true,
      children,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E039_Paintbrush = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Paintbrush",
    deck: "E",
    number: 39,
    category: "BONUS_POINTS_-_GET",
    desc: ["Each harvest, you can exchange exactly 1 <CLAY> for your choice of 2 <FOOD> or 1 bonus <SCORE>."],
    cost: { wood: 1 },
    prerequisite: '1 pig',
    extraVp: true,
    waresSalesmanGains: [{ clay: 1, reed: 1 }],
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const E039_Paintbrush_impl = E039_Paintbrush.impl
