import { Occupation } from '../types'

const CARD_ID = 'B147_Huntsman'

export const B147_Huntsman = new Occupation({
  id: CARD_ID,
  name: 'Huntsman',
  deck: 'B',
  number: 147,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time after you use a wood accumulation space, you can pay 1 <GRAIN> to get 1 <PIG>.'],
  cost: {},
  players: '3+',
  newSet: true,
})
