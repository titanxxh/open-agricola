import { Occupation } from '../types'

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
