import { Occupation } from '../types'

const CARD_ID = 'C100_Butler'

export const C100_Butler = new Occupation({
  id: CARD_ID,
  name: "Butler",
  deck: "C",
  number: 100,
  category: "POINTS_PROVIDER",
  desc: ["If you play this card in round 11 or before, during scoring, you get 4 bonus <SCORE> if you then have more rooms than people."],
  cost: {},
  players: "1+",
  maxRound: 11,
  extraVp: true,
})
