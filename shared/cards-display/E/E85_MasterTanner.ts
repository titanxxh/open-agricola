import { Occupation } from '../types'

const CARD_ID = 'E85_MasterTanner'

export const E85_MasterTanner = new Occupation({
  id: CARD_ID,
  name: 'Master Tanner',
  deck: 'E',
  number: 85,
  desc: ['For each <PIG> or <CATTLE> you turn into <FOOD>, you can place 1 of that <FOOD> on this card. While its <FOOD> equals your number of rooms, this card provides room for 1 person.'],
  cost: {},
  players: '1+',
  category: 'FARMYARD_-_PLACE_FOR_PERSON',
})
