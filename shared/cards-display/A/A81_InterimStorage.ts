import { MinorImprovement } from '../types'

const CARD_ID = 'A81_InterimStorage'

export const A81_InterimStorage = new MinorImprovement({
  id: CARD_ID,
  name: "Interim Storage",
  deck: "A",
  number: 81,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time you use a clay/reed/stone accumulation space, place 1 <WOOD>/<CLAY>/<REED> on this card. At the start of rounds 7, 11, and 14, move all the goods on this card to your supply."],
  cost: {"food":2},
  newSet: true,
})
