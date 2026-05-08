import { Occupation } from '../types'

const CARD_ID = 'E114_ShedBuilder'

export const E114_ShedBuilder = new Occupation({
  id: CARD_ID,
  name: 'Shed Builder',
  deck: 'E',
  number: 114,
  category: 'CROPS_-_GRAIN_AND_VEGETABLE',
  desc: [
    'When you build your 1st and 2nd stable, you get 1 <GRAIN>. When you build your 3rd and 4th stable, you get 1 <VEGETABLE>. (This does not apply to stables you have already built.)',
  ],
  cost: {},
  players: '1+',
})
