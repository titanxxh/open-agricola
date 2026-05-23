import { MinorImprovement } from '../types'

const CARD_ID = 'A5_ClayEmbankment'

export const A5_ClayEmbankment = new MinorImprovement({
  id: CARD_ID,
  name: 'Clay Embankment',
  deck: 'A',
  number: 5,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['You immediately get 1 <CLAY> for every 2 <CLAY> you already have in your supply.'],
  cost: { food: 1 },
})
