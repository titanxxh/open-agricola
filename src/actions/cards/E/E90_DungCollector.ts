import { Occupation } from '../types'

export const E90_DungCollector = new Occupation({
  id: "E90_DungCollector",
  name: "Dung Collector",
  deck: "E",
  number: 90,
  desc: ["Each time you get 2 or more newborn animals, you can pay 1 <FOOD> to plow 1 field."],
  cost: {},
  players: "1+",
})
