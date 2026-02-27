import { Occupation } from '../types'

export const D131_CraftsmanshipPromoter = new Occupation({
  id: "D131_CraftsmanshipPromoter",
  name: "Craftsmanship Promoter",
  deck: "D",
  number: 131,
  category: "ACTIONS_BOOSTER",
  desc: ["When you play this card, you immediately get 1 <STONE>. You can build any of the major improvements in the bottom row of the supply board even when taking a __Minor Improvement__ action."],
  cost: {},
  players: "3+",
  newSet: true,
})
