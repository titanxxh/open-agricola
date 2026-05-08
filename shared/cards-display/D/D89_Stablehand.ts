import { Occupation } from '../types'

const CARD_ID = 'D89_Stablehand'

export const D89_Stablehand = new Occupation({
  id: CARD_ID,
  name: 'Stablehand',
  deck: 'D',
  number: 89,
  category: 'FARM_PLANNER',
  desc: ['Each time you build at least 1 fence, you can also build a stable without paying <WOOD> for the stable.'],
  cost: {},
  players: '1+',
})
