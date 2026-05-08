import { Occupation } from '../types'

const CARD_ID = 'C101_StallHolder'

export const C101_StallHolder = new Occupation({
  id: CARD_ID,
  name: 'Stall Holder',
  deck: 'C',
  number: 101,
  category: 'POINTS_PROVIDER',
  desc: ['Once per round, if you have 0/1/2/3/4 unfenced stables on your farm, you can exchange 2 <GRAIN> for 1 bonus <SCORE> and 1/2/3/4/5 <FOOD>.'],
  cost: {},
  players: '1+',
})
