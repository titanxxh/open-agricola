import { Occupation } from '../types'

const CARD_ID = 'C127_Lover'

export const C127_Lover = new Occupation({
  id: CARD_ID,
  name: "Lover",
  deck: "C",
  number: 127,
  category: "FARM_PLANNER",
  desc: ["When you play this card, immediately pay an amount of <FOOD> equal to the number of complete rounds left to play to take a __Family Growth Even without Room__ action."],
  players: "3+",
  newSet: true,
})
