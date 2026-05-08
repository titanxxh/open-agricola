import { PlayerActionCard } from '../types'

const CARD_ID = 'D51_Archway'

export const D51_Archway = new PlayerActionCard({
  id: CARD_ID,
  name: "Archway",
  deck: "D",
  number: 51,
  category: "FOOD_PROVIDER",
  desc: ["This card is an action space for all. A player who uses it immediately gets 1 <FOOD>. Immediately before the returning home phase, they can use an unoccupied action space with the person from this card."],
  cost: {"clay":2},
  vp: 4,
  prerequisite: "No Occupations",
  occupationPrerequisites: {"max":0},
})
