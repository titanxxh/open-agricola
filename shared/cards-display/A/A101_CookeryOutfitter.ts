import { Occupation } from '../types'

const CARD_ID = 'A101_CookeryOutfitter'

export const A101_CookeryOutfitter = new Occupation({
  id: CARD_ID,
  name: "Cookery Outfitter",
  deck: "A",
  number: 101,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each cooking improvement you have. (Ovens are not considered cooking improvements.)"],
  cost: {},
  players: "1+",
  extraVp: true,
})
