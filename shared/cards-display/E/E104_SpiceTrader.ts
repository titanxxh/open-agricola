import { Occupation } from '../types'

const CARD_ID = 'E104_SpiceTrader'

export const E104_SpiceTrader = new Occupation({
  id: CARD_ID,
  name: 'Spice Trader',
  deck: 'E',
  number: 104,
  category: 'GOODS_-_GET',
  desc: ['If you play this card in round 4 or before, place 3 <VEGETABLE> on the space for round 11. At the start of that round, you get the <VEGETABLE>.'],
  players: '1+',
})
