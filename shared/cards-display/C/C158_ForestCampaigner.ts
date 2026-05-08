import { Occupation } from '../types'

const CARD_ID = 'C158_ForestCampaigner'

export const C158_ForestCampaigner = new Occupation({
  id: CARD_ID,
  name: 'Forest Campaigner',
  deck: 'C',
  number: 158,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time before you place a person, if there are at least 8 <WOOD> total on accumulation spaces, you get 1 <FOOD>.',
  ],
  cost: {},
  players: '4+',
})
