import { Occupation } from '../types'

const CARD_ID = 'A135_AnimalReeve'

export const A135_AnimalReeve = new Occupation({
  id: CARD_ID,
  name: 'Animal Reeve',
  deck: 'A',
  number: 135,
  category: 'POINTS_PROVIDER',
  desc: ['If there are still 1/3/6/9 complete rounds left to play, you immediately get 1/2/3/4 <WOOD>. During scoring, each player with 2/3/4+ animals of each type gets 1/3/5 bonus <SCORE>.'],
  cost: {},
  players: '3+',
  extraVp: true,
})
