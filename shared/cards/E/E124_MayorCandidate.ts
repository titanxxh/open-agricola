import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E124_MayorCandidate'

export const E124_MayorCandidate = new Occupation({
  id: CARD_ID,
  name: "Mayor Candidate",
  deck: "E",
  number: 124,
  desc: ["You immediately get 2 <WOOD> and 2 <STONE>. During scoring, you get 1 negative point for each <WOOD> and each <STONE> in your supply. You can no longer discard <WOOD> or <STONE>."],
  cost: {},
  players: "1+",
})

export const E124_MayorCandidate_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return -((player.resources.wood ?? 0) + (player.resources.stone ?? 0))
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
