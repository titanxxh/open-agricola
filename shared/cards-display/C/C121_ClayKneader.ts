import { Occupation } from '../types'

const CARD_ID = 'C121_ClayKneader'

export const C121_ClayKneader = new Occupation({
  id: CARD_ID,
  name: 'Clay Kneader',
  deck: 'C',
  number: 121,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <WOOD> and 2 <CLAY>. Each time after you use __Grain Seeds__ or __Vegetable Seeds__ action space, you get 1 <CLAY>.',
  ],
  cost: {},
  players: '1+',
  implemented: true,
})
