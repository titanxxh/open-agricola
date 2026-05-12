import { Occupation } from '../../../../shared/cards-display/types'

const CARD_ID = 'A99_Test'

export const A99_Test = new Occupation({
  id: CARD_ID,
  name: 'Test Card',
  deck: 'A',
  number: 99,
  category: 'POINTS_PROVIDER',
  desc: ['placeholder'],
  cost: { wood: 1, food: 2 },
  players: '1+',
  vp: 1,
  prerequisite: 'Wooden House',
})
