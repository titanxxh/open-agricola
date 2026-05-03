import { MinorImprovement } from '../types'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import { fieldHasCrop } from '../../game/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'B45_StrawberryPatch'

// BGA isBuyable: count(getVegetableFields()) < 2 → false
registerPrerequisite('2 Vegetable Fields', (player) =>
  player.fields.filter((f) => fieldHasCrop(f, 'vegetable')).length >= 2,
)

export const B45_StrawberryPatch = new MinorImprovement({
  id: CARD_ID,
  name: 'Strawberry Patch',
  deck: 'B',
  number: 45,
  category: 'FOOD_PROVIDER',
  desc: ['Place 1 <FOOD> on each of the next 3 round spaces. At the start of these rounds, you get the <FOOD>.'],
  cost: { wood: 1 },
  vp: 2,
  prerequisite: '2 Vegetable Fields',
})

export const B45_StrawberryPatch_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: 3,
      resources: { food: 1 },
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
