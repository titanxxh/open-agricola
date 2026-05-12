import { Occupation } from '../types'

const CARD_ID = 'B99_Tutor'

export const B99_Tutor = new Occupation({
  id: CARD_ID,
  name: "Tutor",
  deck: "B",
  number: 99,
  category: "POINTS_PROVIDER",
  desc: ['During scoring, you get 1 bonus <SCORE> for each occupation played after this one.'],
  cost: {},
  players: "1+",
  extraVp: true,
})
