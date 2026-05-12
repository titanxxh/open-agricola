import { Occupation } from '../types'

const CARD_ID = 'E151_DeliveryNurse'

export const E151_DeliveryNurse = new Occupation({
  id: CARD_ID,
  name: 'Delivery Nurse',
  deck: 'E',
  number: 151,
  desc: ['Once this game, if you have all types of animals, you can use any __Wish for Children__ action space even without room.'],
  cost: {},
  players: '4+',
  category: 'ACTION',
})
