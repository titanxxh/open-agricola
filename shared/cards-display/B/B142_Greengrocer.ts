import { Occupation } from '../types'

const CARD_ID = 'B142_Greengrocer'

export const B142_Greengrocer = new Occupation({
  id: CARD_ID,
  name: 'Greengrocer',
  deck: 'B',
  number: 142,
  category: 'CROP_PROVIDER',
  desc: ['Each time you use the __Grain Seeds__ action space, you also get 1 <VEGETABLE>.'],
  cost: {},
  players: '3+',
})
