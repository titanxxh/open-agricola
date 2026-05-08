import { MinorImprovement } from '../types'

const CARD_ID = 'B74_ThickForest'

export const B74_ThickForest = new MinorImprovement({
  id: CARD_ID,
  name: 'Thick Forest',
  deck: 'B',
  number: 74,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Place 1 <WOOD> on each remaining even-numbered round space. At the start of these rounds, you get the <WOOD>.'],
  cost: {},
  prerequisite: '5 Clay in Your Supply',
})
