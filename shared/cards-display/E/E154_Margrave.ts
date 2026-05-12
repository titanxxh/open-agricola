import { Occupation } from '../types'

const CARD_ID = 'E154_Margrave'

export const E154_Margrave = new Occupation({
  id: CARD_ID,
  name: "Margrave",
  deck: "E",
  number: 154,
  category: "BONUS_POINTS",
  desc: ['Once you live in a stone house, you get 2 <FOOD> each time any player renovates and, during scoring, 1 bonus <SCORE> for each wood house and clay house.'],
  cost: {},
  players: "4+",
  extraVp: true,
})
