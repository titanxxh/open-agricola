import { Occupation } from '../types'

const CARD_ID = 'B161_Weakling'

export const B161_Weakling = new Occupation({
  id: CARD_ID,
  name: 'Weakling',
  deck: 'B',
  number: 161,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time it is your turn in the work phase, if there are one or more accumulation spaces with 5+ goods on them and you do not use any of them, you get 1 <VEGETABLE>.',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
