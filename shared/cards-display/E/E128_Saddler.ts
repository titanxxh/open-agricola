import { Occupation } from '../types'

const CARD_ID = 'E128_Saddler'

export const E128_Saddler = new Occupation({
  id: CARD_ID,
  name: "Saddler",
  deck: "E",
  number: 128,
  category: "FARMYARD",
  desc: ["Each time after you build a major improvement, you can pay 1 <FOOD> to plow 1 field."],
  cost: {},
  players: "3+",
})
