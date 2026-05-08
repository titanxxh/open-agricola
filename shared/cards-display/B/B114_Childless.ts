import { Occupation } from '../types'

const CARD_ID = 'B114_Childless'

export const B114_Childless = new Occupation({
  id: CARD_ID,
  name: 'Childless',
  deck: 'B',
  number: 114,
  category: 'CROP_PROVIDER',
  desc: ['At the start of each round, if you have at least 3 rooms but only 2 people, you get 1 <FOOD> and 1 crop of your choice (<GRAIN> or <VEGETABLE>)'],
  cost: {},
  players: '1+',
})
