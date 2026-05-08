import { MinorImprovement } from '../types'

const CARD_ID = 'B83_MuddyPuddles'

export const B83_MuddyPuddles = new MinorImprovement({
  id: CARD_ID,
  name: 'Muddy Puddles',
  deck: 'B',
  number: 83,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Pile (from bottom to top) 1 <PIG>, 1 <FOOD>, 1 <CATTLE>, 1 <FOOD>, and 1 <SHEEP> on this card. At any time, you can pay 1 <CLAY> to take the top good.'],
  cost: { clay: 2 },
  players: '1+',
})
