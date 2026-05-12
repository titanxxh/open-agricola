import { Occupation } from '../types'

const CARD_ID = 'B134_HousebookMaster'

export const B134_HousebookMaster = new Occupation({
  id: CARD_ID,
  name: 'Housebook Master',
  deck: 'B',
  number: 134,
  category: 'POINTS_PROVIDER',
  desc: ['After playing this card, if you renovate to stone in round 13/12/11 or before, you immediately get 1/2/3 <FOOD> and 1/2/3 bonus <SCORE>.'],
  cost: {},
  players: '3+',
})
