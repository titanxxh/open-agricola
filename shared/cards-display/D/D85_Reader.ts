import { Occupation } from '../types'

const CARD_ID = 'D85_Reader'

export const D85_Reader = new Occupation({
  id: CARD_ID,
  name: 'Reader',
  deck: 'D',
  number: 85,
  category: 'FARM_PLANNER',
  desc: [
    'As soon as you have 6 (__7 in draft mode__) occupations in front of you (including this one), this card provides room for one person.',
  ],
  cost: {},
  players: '1+',
  evenMoreSet: true,
})
