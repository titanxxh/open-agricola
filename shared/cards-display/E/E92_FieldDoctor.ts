import { Occupation } from '../types'

const CARD_ID = 'E92_FieldDoctor'

export const E92_FieldDoctor = new Occupation({
  id: CARD_ID,
  name: 'Field Doctor',
  deck: 'E',
  number: 92,
  desc: ['Once this game, if you live in a house with exactly 2 rooms surrounded by 4 field tiles, you can use any __Wish for Children__ action space even without room.'],
  cost: {},
  players: '1+',
  category: 'ACTION_-_FAMILY_GROWTH',
})
