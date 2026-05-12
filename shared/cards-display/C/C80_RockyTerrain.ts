import { MinorImprovement } from '../types'

const CARD_ID = 'C80_RockyTerrain'

export const C80_RockyTerrain = new MinorImprovement({
  id: CARD_ID,
  name: 'Rocky Terrain',
  deck: 'C',
  number: 80,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you plow a field (tile or card), you can also buy 1 <STONE> for 1 <FOOD>.'],
  cost: { food: 1 },
  players: '1+',
})
