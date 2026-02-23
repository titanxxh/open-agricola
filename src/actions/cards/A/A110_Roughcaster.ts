import { Occupation } from '../types'

export const A110_Roughcaster = new Occupation({
  id: "A110_Roughcaster",
  name: "Roughcaster",
  deck: "A",
  number: 110,
  category: "FOOD_PROVIDER",
  desc: ["Each time you build at least 1 clay room or renovate your house from clay to stone, you also get 3 <FOOD>."],
  cost: {},
  players: "1+",
})
