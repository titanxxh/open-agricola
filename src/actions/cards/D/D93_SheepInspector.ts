import { Occupation } from '../types'

export const D93_SheepInspector = new Occupation({
  id: "D93_SheepInspector",
  name: "Sheep Inspector",
  deck: "D",
  number: 93,
  category: "ACTIONS_BOOSTER",
  desc: ["Once per work phase, after you complete a person action, you can pay 1 <SHEEP> and 2 <FOOD> to return another person you placed home, unless it is on the __Meeting Place__ action space."],
  cost: {},
  players: "1+",
})
