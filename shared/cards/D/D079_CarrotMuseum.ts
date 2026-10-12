import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'D079_CarrotMuseum'

const cardImpl = {
  effect: {
  id: CARD_ID,
  timedRules: [{ key: 'museum-reward', at: { kind: 'rounds', rounds: [8, 10, 12], phase: 'onAfterRoundEnd' },
    body: { kind: 'gain', resources: { stone: { kind: 'fields', crop: 'vegetable' }, wood: { kind: 'supply', resource: 'vegetable' } } },
  }],
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D079_CarrotMuseum = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Carrot Museum",
    deck: "D",
    number: 79,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["At the end of rounds 8, 10, and 12, you get 1 <STONE> for each <VEGETABLE> <FIELD> you have and a number of <WOOD> equal to the number of <VEGETABLE> in your supply."],
    vp: 2,
    cost: { wood: 1, clay: 2 },
    maxRound: 8,
    prerequisite: "Play in Round 8 or Before",
  },
  impl: cardImpl,
})

export const D079_CarrotMuseum_impl = D079_CarrotMuseum.impl
