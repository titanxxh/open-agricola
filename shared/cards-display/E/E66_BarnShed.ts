import { MinorImprovement } from '../types'

const CARD_ID = 'E66_BarnShed'

export const E66_BarnShed = new MinorImprovement({
  id: CARD_ID,
  name: "Barn Shed",
  deck: "E",
  number: 66,
  category: "CROPS_-_GRAIN",
  desc: [
    "Each time another player (or, in a solo game, you) uses the __Forest__ accumulation space, you get 1 <GRAIN>.",
  ],
  cost: { wood: 2 },
  prerequisite: "3 Occupations",
  occupationPrerequisites: { min: 3 },
})
