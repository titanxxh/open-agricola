import { Occupation } from '../types'

const CARD_ID = 'C106_PotatoHarvester'

export const C106_PotatoHarvester = new Occupation({
  id: CARD_ID,
  name: 'Potato Harvester',
  deck: 'C',
  number: 106,
  category: 'FOOD_PROVIDER',
  desc: [
    'When you play this card, you immediately get 3 <FOOD>. For each <VEGETABLE> you get from your fields during the field phase of the harvest, you get 1 additional <FOOD>.',
  ],
  cost: {},
  players: '1+',
  implemented: true,
})
