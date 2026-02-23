import { Occupation } from '../types'

export const E124_MayorCandidate = new Occupation({
  id: "E124_MayorCandidate",
  name: "Mayor Candidate",
  deck: "E",
  number: 124,
  desc: ["You immediately get 2 <WOOD> and 2 <STONE>. During scoring, you get 1 negative point for each <WOOD> and each <STONE> in your supply. You can no longer discard <WOOD> or <STONE>."],
  cost: {},
  players: "1+",
})
