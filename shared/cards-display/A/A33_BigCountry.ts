import { MinorImprovement } from '../types'

const CARD_ID = 'A33_BigCountry'

export const A33_BigCountry = new MinorImprovement({
  id: CARD_ID,
  name: 'Big Country',
  deck: 'A',
  number: 33,
  category: 'POINTS_PROVIDER',
  desc: ['For each complete round left to play, you immediately get 1 bonus <SCORE> and 2 <FOOD>.'],
  cost: {},
  prerequisite: 'All Farmyard Spaces Used',
  extraVp: true,
})
