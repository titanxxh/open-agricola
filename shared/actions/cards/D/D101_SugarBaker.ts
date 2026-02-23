import { Occupation } from '../types'

export const D101_SugarBaker = new Occupation({
  id: "D101_SugarBaker",
  name: "Sugar Baker",
  deck: "D",
  number: 101,
  category: "POINTS_PROVIDER",
  desc: ["Each time after you use the __Grain Utilization__ action space, you can buy 1 bonus <SCORE> for 1 <FOOD>. Place the <FOOD> on the action space (for the next visitor)."],
  cost: {},
  players: "1+",
})
