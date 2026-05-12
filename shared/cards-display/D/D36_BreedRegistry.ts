import { MinorImprovement } from '../types'

const CARD_ID = 'D36_BreedRegistry'

export const D36_BreedRegistry = new MinorImprovement({
  id: CARD_ID,
  name: "Breed Registry",
  deck: "D",
  number: 36,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, if you gained at most 2 <SHEEP> from sources other than breeding during the game and have not turned any sheep into food, you get 3 bonus <SCORE>."],
  cost: {},
  prerequisite: "No Sheep",
  extraVp: true,
})
