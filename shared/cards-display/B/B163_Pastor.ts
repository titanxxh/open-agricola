import { Occupation } from '../types'

const CARD_ID = 'B163_Pastor'

export const B163_Pastor = new Occupation({
  id: CARD_ID,
  name: 'Pastor',
  deck: 'B',
  number: 163,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Once you are the only player to live in a house with only 2 rooms, you immediately get 3 <WOOD>, 2 <CLAY>, 1 <REED>, and 1 <STONE> (only once).',
  ],
  cost: {},
  players: '4+',
})
