import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { C21_HeartofStone } from '../../cards-display/C/C21_HeartofStone'
export { C21_HeartofStone }

const CARD_ID = C21_HeartofStone.id

export const C21_HeartofStone_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (state, player) => {
    const revealedAction = state.roundActionOrder[state.round - 1]
    if (revealedAction !== 'western-quarry' && revealedAction !== 'eastern-quarry') return
    // Check if player has room in house (fewer family members than rooms)
    if (familySize(player) >= player.roomTiles.length) return
    return {
      type: 'leaf',
      actionId: 'wish-children',
      optional: true,
      sourceCard: CARD_ID,
      actionContext: { constraints: ['freeRoom'], trueAction: false },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
