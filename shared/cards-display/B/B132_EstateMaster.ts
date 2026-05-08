import { Occupation } from '../types'

const CARD_ID = 'B132_EstateMaster'

export const B132_EstateMaster = new Occupation({
  id: CARD_ID,
  name: 'Estate Master',
  deck: 'B',
  number: 132,
  category: 'POINTS_PROVIDER',
  desc: ['Once you have no unused farmyard spaces left, you get 1 bonus <SCORE> for each <VEGETABLE> that you harvest.'],
  cost: {},
  players: '1+',
})
