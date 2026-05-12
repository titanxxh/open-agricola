import { Occupation } from '../types'

const CARD_ID = 'D153_WealthyMan'

export const D153_WealthyMan = new Occupation({
  id: CARD_ID,
  name: "Wealthy Man",
  deck: "D",
  number: 153,
  category: "POINTS_PROVIDER",
  desc: ["At the start of each of the 1st/2nd/3rd/4th/5th/6th harvest, if you have at least 1/2/3/4/5/6 grain fields, you get 1 bonus <SCORE>."],
  cost: {},
  players: "4+",
  extraVp: true,
})
