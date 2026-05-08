import { Occupation } from '../types'

const CARD_ID = 'E113_Godmother'

export const E113_Godmother = new Occupation({
  id: CARD_ID,
  name: 'Godmother',
  deck: 'E',
  number: 113,
  category: 'CROPS_-_VEGETABLE',
  desc: ['Each time you take a __Family Growth__ action, you also get 1 <VEGETABLE>.'],
  cost: {},
  players: '1+',
})
