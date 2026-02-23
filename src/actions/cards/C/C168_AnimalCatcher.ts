import { MinorImprovement } from '../types'

export const C168_AnimalCatcher = new MinorImprovement({
  id: "C168_AnimalCatcher",
  name: "Animal Catcher",
  deck: "C",
  number: 168,
  category: "LIVESTOCK_PROVIDER",
  desc: ["Each time you use the __Day Laborer__ action space, instead of 2 <FOOD>, you can get 3 different animals from the general supply. If you do, you must pay 1 <FOOD> each harvest left to play."],
  cost: {},
  players: "4+",
  newSet: true,
})
