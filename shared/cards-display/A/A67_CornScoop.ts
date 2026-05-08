import { MinorImprovement } from '../types'

const CARD_ID = 'A67_CornScoop'

export const A67_CornScoop = new MinorImprovement({
  id: CARD_ID,
  name: 'Corn Scoop',
  deck: 'A',
  number: 67,
  category: 'CROP_PROVIDER',
  desc: ['Each time you use the __Grain Seeds__ action space, you get 1 additional <GRAIN>.'],
  cost: { wood: 1 },
})
