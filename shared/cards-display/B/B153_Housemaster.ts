import { Occupation } from '../types'

const CARD_ID = 'B153_Housemaster'

export const B153_Housemaster = new Occupation({
  id: CARD_ID,
  name: "Housemaster",
  deck: "B",
  number: 153,
  category: "POINTS_PROVIDER",
  desc: ['During scoring, total the base point values of your major improvements. The smallest value counts double. If the total is at least 5/7/9/11, you get 1/2/3/4 bonus <SCORE>.'],
  cost: {},
  players: "1+",
  extraVp: true,
})
