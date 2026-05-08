import { Occupation } from '../types'

const CARD_ID = 'C92_AutumnMother'

export const C92_AutumnMother = new Occupation({
  id: CARD_ID,
  name: "Autumn Mother",
  deck: "C",
  number: 92,
  category: "ACTIONS_BOOSTER",
  desc: ["Immediately before each harvest, if you have room in your house, you can take a __Family Growth__ action for 3 <FOOD>."],
  cost: {},
  players: "1+",
})
