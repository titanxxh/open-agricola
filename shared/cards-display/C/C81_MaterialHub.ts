import { MinorImprovement } from '../types'

const CARD_ID = 'C81_MaterialHub'

export const C81_MaterialHub = new MinorImprovement({
  id: CARD_ID,
  name: 'Material Hub',
  deck: 'C',
  number: 81,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Immediately place 2 of each building resource on this card. Each time any player (including you) takes at least 5 <WOOD>, 4 <CLAY>, 3 <REED>, or 3 <STONE>, you get 1 of that building resource from this card.',
  ],
  cost: { wood: 1, clay: 1 },
  prerequisite: '1 reed and 1 stone in your supply',
})
