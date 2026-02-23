import { Occupation } from '../types'

export const D103_CanalBoatman = new Occupation({
  id: "D103_CanalBoatman",
  name: "Canal Boatman",
  deck: "D",
  number: 103,
  category: "GOODS_PROVIDER",
  desc: ["Each time you use __Fishing__ or __Reed Bank__, you can pay 1 <FOOD> to immediately place another person on this card. If you do, you get your choice of 3 <STONE> or 1 <GRAIN> plus 1 <VEGETABLE>."],
  cost: {},
  players: "1+",
  newSet: true,
})
