import { Occupation } from '../types'

const CARD_ID = 'A87_Conservator'

export const A87_Conservator = new Occupation({
  id: CARD_ID,
  name: 'Conservator',
  deck: 'A',
  number: 87,
  category: 'FARM_PLANNER',
  desc: [
    'When you renovate your home, you can renovate from wood directly into stone.',
  ],
  cost: {},
  players: '1+',
})
