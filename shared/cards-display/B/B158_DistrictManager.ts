import { Occupation } from '../types'

const CARD_ID = 'B158_DistrictManager'

export const B158_DistrictManager = new Occupation({
  id: CARD_ID,
  name: 'District Manager',
  deck: 'B',
  number: 158,
  category: 'FOOD_PROVIDER',
  desc: ['At the end of each work phase, if you used both the __Forest__ and __Grove__ accumulation spaces, you get 5 <FOOD>.'],
  cost: {},
  players: '4+',
})
