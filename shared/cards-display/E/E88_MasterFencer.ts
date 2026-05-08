import { Occupation } from '../types'

const CARD_ID = 'E88_MasterFencer'

export const E88_MasterFencer = new Occupation({
  id: CARD_ID,
  name: 'Master Fencer',
  deck: 'E',
  number: 88,
  category: 'FARMYARD_-_FENCING',
  desc: ['Once you live in a stone house, at the start of each round, you can pay 2 or 3 <WOOD> to build up to 3 or 4 fences, respectively.'],
  cost: {},
  players: '1+',
})
