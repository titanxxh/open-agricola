import { Occupation } from '../types'

export const E92_FieldDoctor = new Occupation({
  id: "E92_FieldDoctor",
  name: "Field Doctor",
  deck: "E",
  number: 92,
  desc: ["Once this game, if you live in a house with exactly 2 rooms surrounded by 4 field tiles, you can use any __Wish for Children__ action space even without room."],
  cost: {},
  players: "1+",
})
