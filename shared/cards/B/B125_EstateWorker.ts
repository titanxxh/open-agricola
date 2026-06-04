import { defineOccupationCard } from '../card-source'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B125_EstateWorker'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const base = state.round
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: base + 1, resources: { wood: 1 } },
        { round: base + 2, resources: { clay: 1 } },
        { round: base + 3, resources: { reed: 1 } },
        { round: base + 4, resources: { stone: 1 } },
      ],
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B125_EstateWorker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Estate Worker',
    deck: 'B',
    number: 125,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Place 1 <WOOD>, 1 <CLAY>, 1 <REED>, and 1 <STONE> in this order on the next 4 round spaces. At the start of these rounds, you get the respective building resource.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B125_EstateWorker_impl = B125_EstateWorker.impl
