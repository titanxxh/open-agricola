import { Occupation } from '../types'

const CARD_ID = 'A113_HeresyTeacher'

export const A113_HeresyTeacher = new Occupation({
  id: CARD_ID,
  name: 'Heresy Teacher',
  deck: 'A',
  number: 113,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time you use a "Lessons" action space, you get 1 <VEGETABLE> in each of your fields with at least 3 <GRAIN> and no <VEGETABLE>. Place the <VEGETABLE> below the <GRAIN>.',
  ],
  cost: {},
  players: '1+',
})
