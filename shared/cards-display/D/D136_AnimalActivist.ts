import { Occupation } from '../types'

const CARD_ID = 'D136_AnimalActivist'

export const D136_AnimalActivist = new Occupation({
  id: CARD_ID,
  name: "Animal Activist",
  deck: "D",
  number: 136,
  category: "POINTS_PROVIDER",
  desc: [
    'If there are still 3/6/9 complete rounds left to play, you immediately get 2/3/4 <WOOD>. During scoring, each player with the most fenced stables gets 2 bonus <SCORE>.',
  ],
  cost: {},
  players: "3+",
  extraVp: true,
})
