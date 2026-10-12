import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E149_MidnightFencer'

const cardImpl = {
  effect: {
    id: CARD_ID,
  timedRules: [{ key: 'borrowed-final-fences', at: { kind: 'rounds', rounds: [14], phase: 'onStartHarvest' }, body: { kind: 'operation', operation: { kind: 'borrow-fences', maximumPerOpponent: 2 } } }],
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E149_MidnightFencer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Midnight Fencer',
    deck: 'E',
    number: 149,
    desc: ["At the start of the last harvest, you can take up to 2 of each other player's unbuilt <FENCE> and build them on your farm at no cost. (Your farm can then have over 15 <FENCE>.)"],
    cost: {},
    players: '4+',
    category: 'FARMYARD',
  },
  impl: cardImpl,
})

export const E149_MidnightFencer_impl = E149_MidnightFencer.impl
