import { Occupation } from '../types'

const CARD_ID = 'E110_Dentist'

export const E110_Dentist = new Occupation({
  id: CARD_ID,
  name: 'Dentist',
  deck: 'E',
  number: 110,
  category: 'FOOD',
  desc: ['At the start of each harvest, you can place 1 <WOOD> from your supply on this card, irretrievably. In each feeding phase, you get 1 <FOOD> for each <WOOD> on this card.'],
  cost: {},
  players: '1+',
})
