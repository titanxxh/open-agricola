import { Occupation } from '../types'

const CARD_ID = 'E155_Visionary'

export const E155_Visionary = new Occupation({
  id: CARD_ID,
  name: 'Visionary',
  deck: 'E',
  number: 155,
  category: 'GOODS_-_GET',
  desc: ['If you play this card in round 4 or before, you get 1 <STONE>, 1 <VEGETABLE>, and 2 <PIG>. You cannot grow your family until round 11, unless all other players already have.'],
  players: '4+',
})
