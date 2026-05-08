import { Occupation } from '../types'

const CARD_ID = 'E145_Parvenu'

export const E145_Parvenu = new Occupation({
  id: CARD_ID,
  name: 'Parvenu',
  deck: 'E',
  number: 145,
  category: 'BUILDING_RESOURCES_-_REED',
  desc: ['If you play this card in round 7 or before, choose <CLAY> or <REED>: you immediately get a number of that building resource equal to the number you already have in your supply.'],
  players: '3+',
})
