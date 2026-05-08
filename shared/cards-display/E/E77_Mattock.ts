import { MinorImprovement } from '../types'

const CARD_ID = 'E77_Mattock'

export const E77_Mattock = new MinorImprovement({
  id: CARD_ID,
  name: 'Mattock',
  deck: 'E',
  number: 77,
  category: 'BUILDING_RESOURCES_-_CLAY',
  desc: ['Each time you get <REED> and/or <STONE> from an action space, you get 1 additional <CLAY>.'],
  cost: { wood: 1 },
})
