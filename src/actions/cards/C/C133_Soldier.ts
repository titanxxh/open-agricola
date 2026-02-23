import { Occupation } from '../types'

export const C133_Soldier = new Occupation({
  id: "C133_Soldier",
  name: "Soldier",
  deck: "C",
  number: 133,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each <STONE> + <WOOD> pair in your supply. You cannot score additional points for the resources scored with this card."],
  cost: {},
  players: "3+",
  newSet: true,
})
