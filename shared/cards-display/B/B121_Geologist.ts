import { Occupation } from '../types'

const CARD_ID = 'B121_Geologist'

export const B121_Geologist = new Occupation({
  id: CARD_ID,
  name: 'Geologist',
  deck: 'B',
  number: 121,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time you use the __Forest__ or __Reed Bank__ accumulation space, you also get 1 <CLAY>. In games with 3 or more players, this also applies to the __Clay Pit__.',
  ],
  cost: {},
  players: '1+',
})
