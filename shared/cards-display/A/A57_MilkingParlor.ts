import { MinorImprovement } from '../types'

const CARD_ID = 'A57_MilkingParlor'

export const A57_MilkingParlor = new MinorImprovement({
  id: CARD_ID,
  name: 'Milking Parlor',
  deck: 'A',
  number: 57,
  category: 'FOOD_PROVIDER',
  desc: ['When you play this card, if you have at least 1/3/4 <SHEEP>, you immediately get 2/3/4 <FOOD>. The same applies if you have at least 1/2/3 <CATTLE>.'],
  cost: { wood: 2 },
  vp: 1,
  prerequisite: 'At Least 4 Unused Farmyard Spaces',
  newSet: true,
})
