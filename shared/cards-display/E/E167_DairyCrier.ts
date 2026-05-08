import { Occupation } from '../types'

const CARD_ID = 'E167_DairyCrier'

export const E167_DairyCrier = new Occupation({
  id: CARD_ID,
  name: 'Dairy Crier',
  deck: 'E',
  number: 167,
  desc: [
    'When you play this card, each player (including you) can choose to get 2 <SHEEP> or 2 <FOOD>; you also get 1 <CATTLE>.',
  ],
  cost: {},
  players: '4+',
})
