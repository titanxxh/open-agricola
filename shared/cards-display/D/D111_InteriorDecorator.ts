import { Occupation } from '../types'

const CARD_ID = 'D111_InteriorDecorator'

export const D111_InteriorDecorator = new Occupation({
  id: CARD_ID,
  name: 'Interior Decorator',
  deck: 'D',
  number: 111,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you renovate, place 1 <FOOD> on each of the next 6 round spaces. At the start of these rounds, you get the <FOOD>.',
  ],
  cost: {},
  players: '1+',
})
