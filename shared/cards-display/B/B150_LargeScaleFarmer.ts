import { Occupation } from '../types'

const CARD_ID = 'B150_LargeScaleFarmer'

export const B150_LargeScaleFarmer = new Occupation({
  id: CARD_ID,
  name: 'Large-Scale Farmer',
  deck: 'B',
  number: 150,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time after you use the __Farm Expansion__ or __Major Improvement__ action space while the other is unoccupied, you can pay 1 <FOOD> to use that other space with the same person.',
  ],
  cost: {},
  players: '4+',
  newSet: true,
})
