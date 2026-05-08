import { Occupation } from '../types'

const CARD_ID = 'C116_FurnitureMaker'

export const C116_FurnitureMaker = new Occupation({
  id: CARD_ID,
  name: 'Furniture Maker',
  deck: 'C',
  number: 116,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <WOOD>. Each time you play an occupation after this one, you get 1 <WOOD> for each <FOOD> paid as occupation cost.',
  ],
  cost: {},
  players: '1+',
})
