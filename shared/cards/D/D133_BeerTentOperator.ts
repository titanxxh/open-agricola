import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D133_BeerTentOperator'

export const D133_BeerTentOperator = new Occupation({
  id: CARD_ID,
  name: "Beer Tent Operator",
  deck: "D",
  number: 133,
  category: "POINTS_PROVIDER",
  desc: ["In the feeding phase of each harvest, you can use this card to turn 1 <WOOD> plus 1 <GRAIN> into 1 bonus <SCORE> and 2 <FOOD>."],
  cost: {},
  players: "3+",
})

export const D133_BeerTentOperator_impl = {
  effect: {
  id: CARD_ID,
  onHarvestFeedingPhase: (_state, player) => {
    if (player.resources.wood < 1 || player.resources.grain < 1) return

    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'pay', params: { wood: 1, grain: 1 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
