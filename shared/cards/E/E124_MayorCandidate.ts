import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E124_MayorCandidate'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return -((player.resources.wood ?? 0) + (player.resources.stone ?? 0))
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E124_MayorCandidate = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Mayor Candidate",
    deck: "E",
    number: 124,
    desc: ["You immediately get 2 <WOOD> and 2 <STONE>. During scoring, you get 1 negative point for each <WOOD> and each <STONE> in your supply. You can no longer discard <WOOD> or <STONE>."],
    cost: {},
    players: "1+",
    extraVp: true,
    category: 'BUILDING_RESOURCES_-_STONE',
  },
  impl: cardImpl,
})

export const E124_MayorCandidate_impl = E124_MayorCandidate.impl
