import { Occupation } from '../types'

const CARD_ID = 'D135_GardeningHeadOfficial'

export const D135_GardeningHeadOfficial = new Occupation({
  id: CARD_ID,
  name: "Gardening Head Official",
  deck: "D",
  number: 135,
  category: "POINTS_PROVIDER",
  desc: [
    'If there are still 3/6/9 complete rounds left to play, you immediately get 2/3/4 <WOOD>. During scoring, each player with the most vegetables in their fields gets 2 bonus <SCORE>.',
  ],
  cost: {},
  players: "3+",
  extraVp: true,
})
