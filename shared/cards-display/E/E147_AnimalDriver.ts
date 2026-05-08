import { Occupation } from '../types'

const CARD_ID = 'E147_AnimalDriver'

export const E147_AnimalDriver = new Occupation({
  id: CARD_ID,
  name: "Animal Driver",
  deck: "E",
  number: 147,
  category: "ANIMALS_-_ALL",
  desc: ["At the start of each harvest, if you have 1/2/3+ fenced stables, you get 1 <SHEEP>/<PIG>/<CATTLE>."],
  cost: {},
  players: "3+",
})
