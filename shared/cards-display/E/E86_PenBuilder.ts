import { Occupation } from '../types'

const CARD_ID = 'E86_PenBuilder'

export const E86_PenBuilder = new Occupation({
  id: CARD_ID,
  name: 'Pen Builder',
  deck: 'E',
  number: 86,
  category: 'FARMYARD_-_PLACE_FOR_ANIMALS',
  desc: ['At any time, you can discard 1 <WOOD> from your supply. This card can hold two animals of any type for each <WOOD> discarded this way.'],
  cost: {},
  animalHolder: true,
  players: '1+',
})
