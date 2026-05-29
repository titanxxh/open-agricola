import { Occupation } from '../types'

const CARD_ID = 'B109_PaperMaker'

export const B109_PaperMaker = new Occupation({
  id: CARD_ID,
  name: "Paper Maker",
  deck: "B",
  number: 109,
  category: "FOOD_PROVIDER",
  desc: ["Immediately before playing each occupation after this one, you can pay 1 <WOOD> total to get 1 <FOOD> for each occupation you have in front of you."],
  cost: {},
  players: "1+",
  waresSalesmanGains: [{ wood: 1, reed: 1 }],
})
