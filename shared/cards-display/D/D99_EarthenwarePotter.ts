import { Occupation } from '../types'

const CARD_ID = 'D99_EarthenwarePotter'

export const D99_EarthenwarePotter = new Occupation({
  id: CARD_ID,
  name: "Earthenware Potter",
  deck: "D",
  number: 99,
  category: "POINTS_PROVIDER",
  desc: [
    'If you play this card in round 4 or before, after the final harvest, you get 1 bonus <SCORE> for each person for which you then pay 1 <CLAY>.',
  ],
  cost: {},
  players: "1+",
})
