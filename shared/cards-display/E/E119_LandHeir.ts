import { Occupation } from '../types'

const CARD_ID = 'E119_LandHeir'

export const E119_LandHeir = new Occupation({
  id: CARD_ID,
  name: 'Land Heir',
  deck: 'E',
  number: 119,
  category: 'BUILDING_RESOURCES_-_WOOD_(AND_CLAY)',
  desc: ['If you play this card in round 4 or before, place 4 <WOOD> and 4 <CLAY> on the space for round 9. At the start of this round, you get the resources.'],
  players: '1+',
})
