import { Occupation } from '../types'

export const C86_LivestockFeeder = new Occupation({
  id: "C86_LivestockFeeder",
  name: "Livestock Feeder",
  deck: "C",
  number: 86,
  category: "FARM_PLANNER",
  desc: ["When you play this card, you immediately get 1 <GRAIN>. This card can hold 1 animal of any type for each <GRAIN> in your supply."],
  cost: {},
  occupationPrerequisites: {"min":2},
  players: "1+",
})
