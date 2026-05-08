import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C111_SmallAnimalBreeder } from '../../cards-display/C/C111_SmallAnimalBreeder'
export { C111_SmallAnimalBreeder }

const CARD_ID = C111_SmallAnimalBreeder.id

export const C111_SmallAnimalBreeder_impl = {
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (state, player) => {
    // upcoming round = state.round + 1 (round hasn't been incremented yet at this hook)
    const upcomingRound = state.round + 1
    if ((player.resources.food ?? 0) >= upcomingRound) {
      return gainLeaf(CARD_ID, { food: 1 })
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
