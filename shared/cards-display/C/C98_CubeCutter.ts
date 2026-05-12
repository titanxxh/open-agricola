import { Occupation } from '../types'

const CARD_ID = 'C98_CubeCutter'

export const C98_CubeCutter = new Occupation({
  id: CARD_ID,
  name: 'Cube Cutter',
  deck: 'C',
  number: 98,
  category: 'POINTS_PROVIDER',
  desc: ['When you play this card, you immediately get 1 <WOOD>. In the field phase of each harvest, you can use this card to exchange exactly 1 <WOOD> and 1 <FOOD> for 1 bonus <SCORE>.'],
  cost: {},
  players: '1+',
  extraVp: true,
})
