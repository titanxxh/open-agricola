import { Occupation } from '../types'

const CARD_ID = 'B98_OrganicFarmer'

export const B98_OrganicFarmer = new Occupation({
  id: CARD_ID,
  name: "Organic Farmer",
  deck: "B",
  number: 98,
  category: "POINTS_PROVIDER",
  desc: ['During the scoring, you get 1 bonus <SCORE> for each pasture containing at least 1 animal while having unused capacity for at least three more animals.'],
  cost: {},
  players: "1+",
  extraVp: true,
})
