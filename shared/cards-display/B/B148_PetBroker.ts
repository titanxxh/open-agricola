import { Occupation } from '../types'

const CARD_ID = 'B148_PetBroker'

export const B148_PetBroker = new Occupation({
  id: CARD_ID,
  name: 'Pet Broker',
  deck: 'B',
  number: 148,
  desc: ['When you play this card, you immediately get 1 <SHEEP>. You can keep 1 <SHEEP> on this card for each occupation in front of you.'],
  cost: {},
  animalHolder: true,
  players: '4+',
  category: 'FARM_PLANNER',
})
