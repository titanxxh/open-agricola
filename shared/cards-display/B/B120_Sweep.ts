import { Occupation } from '../types'

const CARD_ID = 'B120_Sweep'

export const B120_Sweep = new Occupation({
  id: CARD_ID,
  name: 'Sweep',
  deck: 'B',
  number: 120,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time before you use the action space above the most recent round 1-14 action space, you get 2 <CLAY>.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})
