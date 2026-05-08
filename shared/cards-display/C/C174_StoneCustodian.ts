import { Occupation } from '../types'

export const C174_StoneCustodian = new Occupation({
  id: 'C174_StoneCustodian',
  name: 'Stone Custodian',
  deck: 'C',
  number: 174,
  category: 'CROP_PROVIDER',
  desc: ['At the end of each work phase, if 1 stone accumulation space has stone left, you get 1 grain If 2 stone accumulation spaces have stone left, you get 1 vegetable instead.'],
  cost: {},
  players: '5+',
})
