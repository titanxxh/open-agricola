import { Occupation } from '../types'

const CARD_ID = 'B151_LittlePeasant'

export const B151_LittlePeasant = new Occupation({
  id: CARD_ID,
  name: "Little Peasant",
  deck: "B",
  number: 151,
  category: "ACTIONS_BOOSTER",
  desc: ["You immediately get 1 <STONE>. As long as you live in a wooden house with exactly 2 rooms, actions spaces—excluding Meeting Place—are not considered occupied for you."],
  cost: {},
  players: "4+",
})
