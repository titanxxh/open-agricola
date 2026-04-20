import { Occupation } from '../../../../shared/cards/types'

export const A999_TestCard = new Occupation({
  id: 'A999_TestCard',
  name: 'Test Card',
  deck: 'A',
  number: 999,
  category: 'FOOD_PROVIDER',
  desc: ['A test card for unit tests.'],
  cost: {},
  players: '1+',
})
