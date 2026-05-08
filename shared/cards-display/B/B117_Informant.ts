import { Occupation } from '../types'

const CARD_ID = 'B117_Informant'

export const B117_Informant = new Occupation({
  id: CARD_ID,
  name: 'Informant',
  deck: 'B',
  number: 117,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <WOOD>. After each work phase, if you have more <STONE> than <CLAY> in your supply, you get 1 <WOOD>.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})
