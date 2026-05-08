import { Occupation } from '../types'

const CARD_ID = 'E139_BunnyBreeder'

/**
 * E139 Bunny Breeder — On buy, choose a single future round n+i (1 <= i <=
 * 14 - n). Place i food on that round's space; at the start of that round,
 * the player gains the food. XOR optional: player may decline.
 */
export const E139_BunnyBreeder = new Occupation({
  id: CARD_ID,
  name: 'Bunny Breeder',
  deck: 'E',
  number: 139,
  category: 'FOOD',
  desc: ['Select a future round space, subtract the number of the current round from it, and place this many <FOOD> on that space. At the start of that round, you get the <FOOD>.'],
  players: '3+',
})
