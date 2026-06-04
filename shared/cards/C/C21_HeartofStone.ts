import { defineMinorCard } from '../card-source'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'C21_HeartofStone'

const cardImpl = {
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

export const C21_HeartofStone = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Heart of Stone',
    deck: 'C',
    number: 21,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'Each time a __Quarry__ accumulation space is revealed, if you have room in your house, you can immediately take a __Family Growth__ action without placing a person.',
      ],
    cost: { food: 4 },
  },
  impl: cardImpl,
})

export const C21_HeartofStone_impl = C21_HeartofStone.impl
