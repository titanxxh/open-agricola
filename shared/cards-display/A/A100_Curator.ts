import { Occupation } from '../types'

const CARD_ID = 'A100_Curator'

export const A100_Curator = new Occupation({
  id: CARD_ID,
  name: 'Curator',
  deck: 'A',
  number: 100,
  category: 'POINTS_PROVIDER',
  desc: ['In the returning home phase of each round, if you return at least 3 people from accumulation spaces, you can buy 1 bonus <SCORE> for 1 <FOOD>.'],
  cost: {},
  players: '1+',
  evenMoreSet: true,
  extraVp: true,
})
