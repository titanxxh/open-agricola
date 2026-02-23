import { Occupation } from '../types'

export const D134_OysterEater = new Occupation({
  id: "D134_OysterEater",
  name: "Oyster Eater",
  deck: "D",
  number: 134,
  category: "POINTS_PROVIDER",
  desc: ["Each time the __Fishing__ accumulation space is used, you get 1 bonus <SCORE> and must skip placing your next person that round. (You can place the person on a later turn.)"],
  cost: {},
  players: "3+",
})
