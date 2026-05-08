import { Occupation } from '../types'

const CARD_ID = 'D121_ClayPlasterer'

export const D121_ClayPlasterer = new Occupation({
  id: CARD_ID,
  name: 'Clay Plasterer',
  deck: 'D',
  number: 121,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Renovating to clay only costs you exactly 1 <CLAY> and 1 <REED>. Each clay room only costs you 3 <CLAY> and 2 <REED> to build.',
  ],
  cost: {},
  players: '1+',
})
