import { Occupation } from '../types'

const CARD_ID = 'D132_HideFarmer'

export const D132_HideFarmer = new Occupation({
  id: CARD_ID,
  name: "Hide Farmer",
  deck: "D",
  number: 132,
  category: "POINTS_PROVIDER",
  desc: ['During scoring, you can pay 1 <FOOD> each for any number of unused farmyard spaces. You do not lose points for these spaces.'],
  cost: {},
  players: "3+",
})
