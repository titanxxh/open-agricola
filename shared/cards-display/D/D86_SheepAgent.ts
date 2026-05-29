import { Occupation } from '../types'

const CARD_ID = 'D86_SheepAgent'

export const D86_SheepAgent = new Occupation({
  id: CARD_ID,
  name: 'Sheep Agent',
  deck: 'D',
  number: 86,
  category: 'FARM_PLANNER',
  desc: ['You can keep 1 <SHEEP> on this card for each occupation card in front of you (including this one), unless it is already able to hold animals.'],
  cost: {},
  animalHolder: true,
  players: '1+',
})
