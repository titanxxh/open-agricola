import { MinorImprovement } from '../types'

const CARD_ID = 'E76_LumberPile'

export const E76_LumberPile = new MinorImprovement({
  id: CARD_ID,
  name: 'Lumber Pile',
  deck: 'E',
  number: 76,
  category: 'BUILDING_RESOURCES_-_WOOD_OR_CLAY',
  desc: [
    'When you play this card, you can immediately return up to 3 <STABLE> from your farmyard board to your supply and get 3 <WOOD> for each.',
  ],
})
