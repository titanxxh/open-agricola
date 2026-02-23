import { MinorImprovement } from '../types'

export const D51_Archway = new MinorImprovement({
  id: "D51_Archway",
  name: "Archway",
  deck: "D",
  number: 51,
  category: "FOOD_PROVIDER",
  desc: ["This card is an action space for all. A player who uses it immediately gets 1 <FOOD>. Immediately before the returning home phase, they can use an unoccupied action space with the person from this card."],
  cost: {"clay":2},
  occupationPrerequisites: {"max":0},
})
