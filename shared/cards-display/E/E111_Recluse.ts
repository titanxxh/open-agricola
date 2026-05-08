import { Occupation } from '../types'

const CARD_ID = 'E111_Recluse'

export const E111_Recluse = new Occupation({
  id: CARD_ID,
  name: 'Recluse',
  deck: 'E',
  number: 111,
  category: 'FOOD',
  desc: [
    'As long as you have no minor improvements in front of you, you get 1 <FOOD> at the start of each round and 1 <WOOD> at the start of each harvest.',
  ],
  cost: {},
  players: '1+',
})
