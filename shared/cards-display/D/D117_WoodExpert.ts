import { Occupation } from '../types'

const CARD_ID = 'D117_WoodExpert'

export const D117_WoodExpert = new Occupation({
  id: CARD_ID,
  name: 'Wood Expert',
  deck: 'D',
  number: 117,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'When you play this card, you immediately get 2 <WOOD>. Each improvement costs you up to 2 <WOOD> less, if you pay 1 <FOOD> instead.',
  ],
  cost: {},
  players: '1+',
})
