import { Occupation } from '../types'

const CARD_ID = 'B88_EstablishedPerson'

export const B88_EstablishedPerson = new Occupation({
  id: CARD_ID,
  name: 'Established Person',
  deck: 'B',
  number: 88,
  category: 'FARM_PLANNER',
  desc: ['If your house has exactly 2 rooms, immediately renovate it without paying any building resources. If you do, you can immediately afterward take a __Build Fences__ action.'],
  cost: {},
  players: '1+',
})
