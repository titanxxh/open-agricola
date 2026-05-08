import { MinorImprovement } from '../types'

const CARD_ID = 'C83_EarlyCattle'

export const C83_EarlyCattle = new MinorImprovement({
  id: CARD_ID,
  name: "Early Cattle",
  deck: "C",
  number: 83,
  category: "LIVESTOCK_PROVIDER",
  desc: ["When you play this card, you immediately get 2 <CATTLE>."],
  vp: -3,
  prerequisite: "1 Pasture",
  newSet: true,
})
