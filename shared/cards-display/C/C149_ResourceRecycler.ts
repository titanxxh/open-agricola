import { Occupation } from '../types'

const CARD_ID = 'C149_ResourceRecycler'

export const C149_ResourceRecycler = new Occupation({
  id: CARD_ID,
  name: 'Resource Recycler',
  deck: 'C',
  number: 149,
  category: 'FARM_PLANNER',
  desc: [
    'Each time another player renovates to stone, if you live in a clay house, you can pay 2 <FOOD> to build a clay room at no additional cost.',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
