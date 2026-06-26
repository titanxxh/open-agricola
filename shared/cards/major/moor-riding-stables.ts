import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'
import type { CardImpl } from '../registry'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'

const CARD_ID = 'Major_Moor_RidingStables'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      if (state.round >= 14) return
      return queueFutureMeeplesFlow(state, {
        cardId: CARD_ID,
        playerId: player.id,
        startRound: state.round + 1,
        count: 14,
        resources: { food: 1 },
        actionContext: { resourceCondition: { kind: 'min-resource', resource: 'horse', amount: 2 } },
      })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const Major_Moor_RidingStables = defineMajorCard({
  meta: {
    id: CARD_ID,
    name: 'Riding Stables',
    deck: 'major',
    number: 107,
    category: 'FOOD_PROVIDER',
    cost: { wood: 2, clay: 1, reed: 1 },
    vp: 3,
    extraVp: false,
    requiresFarmersOfTheMoor: true,
    desc: [
      'Place 1 <FOOD> on each remaining round space.',
      'At the start of each round, gain that <FOOD> if you have at least 2<HORSE>.',
    ],
  } satisfies CardSourceMetaInput,
  impl: cardImpl,
})
