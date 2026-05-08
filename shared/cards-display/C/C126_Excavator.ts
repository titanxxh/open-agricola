import { Occupation } from '../types'

const CARD_ID = 'C126_Excavator'

export const C126_Excavator = new Occupation({
  id: CARD_ID,
  name: 'Excavator',
  deck: 'C',
  number: 126,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time after you use the __Day Laborer__ action space, you get 1 additional <WOOD> and <CLAY>, and you can buy 1 <STONE> for 1 <FOOD>.'],
  cost: {},
  players: '1+',
})
