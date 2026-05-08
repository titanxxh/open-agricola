import { Occupation } from '../types'

const CARD_ID = 'B133_VillagePeasant'

export const B133_VillagePeasant = new Occupation({
  id: CARD_ID,
  name: 'Village Peasant',
  deck: 'B',
  number: 133,
  category: 'POINTS_PROVIDER',
  desc: ['At the start of scoring, you get a number of <VEGETABLE> equal to the smallest of the numbers of major improvements, minor improvements, and occupations you have.'],
  cost: {},
  players: '3+',
  newSet: true,
})
