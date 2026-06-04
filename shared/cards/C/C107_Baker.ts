import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'C107_Baker'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (player.resources.grain < 1) return
    return {
      type: 'leaf',
      actionId: 'bake-bread',
      optional: true,
      sourceCard: CARD_ID,
    }
  },
  onStartHarvestFeedingPhase: (_state, player) => {
    if (player.resources.grain < 1) return
    return {
      type: 'leaf',
      actionId: 'bake-bread',
      optional: true,
      sourceCard: CARD_ID,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C107_Baker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Baker',
    deck: 'C',
    number: 107,
    category: 'FOOD_PROVIDER',
    desc: [
        'When you play this card and at the start of each feeding phase, you can take a __Bake Bread__ action.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const C107_Baker_impl = C107_Baker.impl
