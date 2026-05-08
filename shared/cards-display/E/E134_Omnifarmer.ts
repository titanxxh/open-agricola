import { Occupation } from '../types'

const CARD_ID = 'E134_Omnifarmer'

export const E134_Omnifarmer = new Occupation({
  id: CARD_ID,
  name: 'Omnifarmer',
  deck: 'E',
  number: 134,
  category: 'BONUS_POINTS',
  desc: ['Each harvest, you can place 1 harvested crop or 1 newborn animal on this card, irretrievably. Once this game, if there are 2/3/4/5 different goods on this, you get 3/5/7/9 bonus <SCORE>.'],
  cost: {},
  players: '3+',
})
