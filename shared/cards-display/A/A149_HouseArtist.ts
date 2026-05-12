import { Occupation } from '../types'

const CARD_ID = 'A149_HouseArtist'

export const A149_HouseArtist = new Occupation({
  id: CARD_ID,
  name: 'House Artist',
  deck: 'A',
  number: 149,
  category: 'FARM_PLANNER',
  desc: [
    'Each time you use the __Traveling Players__ accumulation space, you also get a __Build Rooms__ action. Each room you build during the action costs you 1 <REED> less.',
  ],
  cost: {},
  players: '4+',
})
