import { defineMinorCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B53_SculptureCourse'
const harvestRounds = [4, 7, 9, 11, 13, 14]

const cardImpl = {
  effect: {
  id: CARD_ID,
  onAfterRoundEnd: (state, _player) => {
    if (harvestRounds.includes(state.round)) return

    const children: ActionFlow[] = [
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { wood: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: CARD_ID },
        ],
      },
      {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { stone: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { food: 4 }, sourceCard: CARD_ID },
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

export const B53_SculptureCourse = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Sculpture Course",
    deck: "B",
    number: 53,
    category: "FOOD_PROVIDER",
    desc: ["At the end of each round that does not end with a harvest, you can use this card to exchange your choice of 1 <WOOD> for 2 <FOOD>, or 1 <STONE> for 4 <FOOD>."],
    cost: { grain: 1 },
    waresSalesmanGains: [{ wood: 1, reed: 1 }, { stone: 1, reed: 1 }],
  },
  impl: cardImpl,
})

export const B53_SculptureCourse_impl = B53_SculptureCourse.impl
