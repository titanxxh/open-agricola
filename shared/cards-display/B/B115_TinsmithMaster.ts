import { Occupation } from '../types'

const CARD_ID = 'B115_TinsmithMaster'

export const B115_TinsmithMaster = new Occupation({
  id: CARD_ID,
  name: 'Tinsmith Master',
  deck: 'B',
  number: 115,
  category: 'CROP_PROVIDER',
  desc: ['You can hold 1 additional animal in each pasture without a stable. Each time you sow in a field, you can place 1 additional crop of the respective type in that field.'],
  cost: {},
  players: '1+',
  implemented: true,
})
