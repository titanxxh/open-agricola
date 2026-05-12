import { MinorImprovement } from '../types'

const CARD_ID = 'E52_Cubbyhole'

export const E52_Cubbyhole = new MinorImprovement({
  id: CARD_ID,
  name: "Cubbyhole",
  deck: "E",
  number: 52,
  category: "FOOD",
  desc: ["For each room that you add to your house, place 1 <FOOD> from the general supply on this card. At the start of each feeding phase, you get <FOOD> equal to the amount on this card."],
  altCosts: [{ wood: 1 }, { clay: 1 }],
  vp: 1,
})
