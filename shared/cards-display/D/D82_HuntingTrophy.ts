import { MinorImprovement } from '../types'

const CARD_ID = 'D82_HuntingTrophy'

export const D82_HuntingTrophy = new MinorImprovement({
  id: CARD_ID,
  name: 'Hunting Trophy',
  deck: 'D',
  number: 82,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Improvements built on __House Redevelopment__ cost you 1 building resource of your choice less. Fences built on __Farm Redevelopment__ cost you a total of 3 <WOOD> less.',
  ],
  vp: 1,
})
