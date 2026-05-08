import { MinorImprovement } from '../types'

const CARD_ID = 'D49_Bookshelf'

export const D49_Bookshelf = new MinorImprovement({
  id: CARD_ID,
  name: "Bookshelf",
  deck: "D",
  number: 49,
  category: "FOOD_PROVIDER",
  desc: ['Immediately before each time you play an occupation (even before paying the occupation cost), you get 3 <FOOD>.'],
  cost: { wood: 1 },
  vp: 1,
  prerequisite: "3 Occupations",
  occupationPrerequisites: { min: 3 },
  players: "1+",
})
