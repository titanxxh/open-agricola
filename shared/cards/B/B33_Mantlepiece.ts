import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { B33_Mantlepiece } from '../../cards-display/B/B33_Mantlepiece'
export { B33_Mantlepiece }

const CARD_ID = B33_Mantlepiece.id

registerPrerequisite('Clay or Stone House', (player) => player.houseType !== 'wood')

export const B33_Mantlepiece_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    const roundsLeft = Math.max(0, 14 - state.round)
    if (roundsLeft <= 0) return
    // Gain score tokens as food equivalent; TODO: implement bonus-vp leaf for score
    const children = Array.from({ length: roundsLeft }, () => ({
      type: 'leaf' as const,
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    }))
    return { type: 'seq' as const, children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
