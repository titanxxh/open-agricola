import { MinorImprovement } from '../types'

const CARD_ID = 'E11_PettingZoo'

export const E11_PettingZoo = new MinorImprovement({
  id: CARD_ID,
  name: 'Petting Zoo',
  deck: 'E',
  number: 11,
  category: 'FARMYARD_-_PLACE_FOR_ANIMALS',
  desc: ['As long as you have a pasture orthogonally adjacent to your house, you can keep animals of any type on this card, up to the number of rooms in your house.'],
  cost: { wood: 1 },
  animalHolder: true,
})
