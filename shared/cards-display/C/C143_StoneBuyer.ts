import { Occupation } from '../types'

const CARD_ID = 'C143_StoneBuyer'

export const C143_StoneBuyer = new Occupation({
  id: CARD_ID,
  name: 'Stone Buyer',
  deck: 'C',
  number: 143,
  category: 'ACTIONS_BOOSTER',
  desc: ['When you play this card, you can immediately buy exactly 2 <STONE> for 1 <FOOD>. From the next round on, once per round, you can buy 1 <STONE> for 2 <FOOD>.'],
  cost: {},
  players: '3+',
})
