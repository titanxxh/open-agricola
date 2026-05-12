import { Occupation } from '../types'

const CARD_ID = 'D149_CasualWorker'

export const D149_CasualWorker = new Occupation({
  id: CARD_ID,
  name: 'Casual Worker',
  deck: 'D',
  number: 149,
  category: 'FARM_PLANNER',
  desc: [
    'Each time another player uses a __Quarry__ accumulation space, you can choose to get 1 <FOOD> or build a stable without paying wood.',
  ],
  cost: {},
  players: '4+',
})
