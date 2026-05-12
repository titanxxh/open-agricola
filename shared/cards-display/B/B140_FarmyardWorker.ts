import { Occupation } from '../types'

const CARD_ID = 'B140_FarmyardWorker'

export const B140_FarmyardWorker = new Occupation({
  id: CARD_ID,
  name: 'Farmyard Worker',
  deck: 'B',
  number: 140,
  category: 'FOOD_PROVIDER',
  desc: ['At the end of each work phase in which you placed at least 1 good on 1 of your farmyard spaces, you get 2 <FOOD>.'],
  cost: {},
  players: '3+',
})
