import { Occupation } from '../types'

const CARD_ID = 'A129_Swagman'

export const A129_Swagman = new Occupation({
  id: CARD_ID,
  name: 'Swagman',
  deck: 'A',
  number: 129,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Immediately after each time you use the __Farm Expansion__ or __Grain Seeds__ action space, you can use the respective other space with the same person (even if it is occupied).',
  ],
  cost: {},
  players: '3+',
})
