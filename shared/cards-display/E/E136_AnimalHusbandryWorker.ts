import { Occupation } from '../types'

const CARD_ID = 'E136_AnimalHusbandryWorker'

export const E136_AnimalHusbandryWorker = new Occupation({
  id: CARD_ID,
  name: "Animal Husbandry Worker",
  deck: "E",
  number: 136,
  category: "BONUS_POINTS_-_4_WOOD_CARD_COMPETITION",
  desc: ['If there are still 3/6/9 complete rounds left to play, you immediately get 2/3/4 <WOOD> and a __Build Fences__ action. During scoring, each player with the most pastures gets 2 <SCORE>.'],
  cost: {},
  players: "3+",
})
