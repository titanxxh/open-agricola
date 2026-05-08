import { Occupation } from '../types'

const CARD_ID = 'C134_CowPrince'

export const C134_CowPrince = new Occupation({
  id: CARD_ID,
  name: "Cow Prince",
  deck: "C",
  number: 134,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each space in your farmyard (including rooms) holding at least 1 <CATTLE>."],
  cost: {},
  players: "3+",
})
