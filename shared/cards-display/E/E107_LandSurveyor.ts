import { Occupation } from '../types'

const CARD_ID = 'E107_LandSurveyor'

export const E107_LandSurveyor = new Occupation({
  id: CARD_ID,
  name: "Land Surveyor",
  deck: "E",
  number: 107,
  category: "FOOD",
  desc: ["In the field phase of each harvest, if you have at least 2/4/6/7 fields, you get 1/2/3/4 <FOOD>."],
  cost: {},
  players: "1+",
})
