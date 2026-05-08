import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { C92_AutumnMother } from '../../cards-display/C/C92_AutumnMother'
export { C92_AutumnMother }

const CARD_ID = C92_AutumnMother.id

export const C92_AutumnMother_impl = {
  effect: {
  id: CARD_ID,
  onBeforeHarvest: (_state, player) => {
    // Only offer if player has room in house
    if (player.rooms <= familySize(player)) return
    if (player.resources.food < 3) return

    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'pay', params: { food: 3 }, sourceCard: CARD_ID },
        { type: 'leaf', actionId: 'family-growth', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
