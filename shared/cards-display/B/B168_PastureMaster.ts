import { Occupation } from '../types'

const CARD_ID = 'B168_PastureMaster'

export const B168_PastureMaster = new Occupation({
  id: CARD_ID,
  name: 'Pasture Master',
  deck: 'B',
  number: 168,
  category: 'LIVESTOCK_PROVIDER',
  desc: [
    'Each time you renovate, you get 2 <FOOD> and 1 additional animal of the respective type in each of your pastures with stable.',
  ],
  cost: {},
  players: '4+',
})
