import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import { fieldHasCrop } from '../../domain/field'
import type { CardImpl } from '../registry'
import { B45_StrawberryPatch } from '../../cards-display/B/B45_StrawberryPatch'
export { B45_StrawberryPatch }

const CARD_ID = B45_StrawberryPatch.id

registerPrerequisite('2 Vegetable Fields', (player) =>
  player.fields.filter((f) => fieldHasCrop(f, 'vegetable')).length >= 2,
)

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
