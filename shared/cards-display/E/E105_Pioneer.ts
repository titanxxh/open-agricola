import { Occupation } from '../types'

const CARD_ID = 'E105_Pioneer'

export const E105_Pioneer = new Occupation({
  id: CARD_ID,
  name: 'Pioneer',
  deck: 'E',
  number: 105,
  category: 'GOODS_-_GET',
  desc: [
    'When you play this card and each time before you use the most recent action space card, you get 1 building resource of your choice and 1 <FOOD>.',
  ],
  cost: {},
  players: '1+',
})
