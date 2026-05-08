import { Occupation } from '../types'

const CARD_ID = 'A122_PanBaker'

export const A122_PanBaker = new Occupation({
  id: CARD_ID,
  name: 'Pan Baker',
  deck: 'A',
  number: 122,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you use the __Grain Utilization__ action space, you also get 2 <CLAY> and 1 <WOOD>.'],
  cost: {},
  players: '1+',
  newSet: true,
})
