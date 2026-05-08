import { Occupation } from '../types'

const CARD_ID = 'E141_VegetableVendor'

export const E141_VegetableVendor = new Occupation({
  id: CARD_ID,
  name: 'Vegetable Vendor',
  deck: 'E',
  number: 141,
  category: 'CROPS',
  desc: ['Each time you use the __Major Improvement__ or __Vegetable Seeds__ action space, you also get 1 <VEGETABLE> or a __Major or Minor Improvement__ action, respectively.'],
  cost: {},
  players: '3+',
})
