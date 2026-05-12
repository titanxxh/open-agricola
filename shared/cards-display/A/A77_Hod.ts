import { MinorImprovement } from '../types'

const CARD_ID = 'A77_Hod'

export const A77_Hod = new MinorImprovement({
  id: CARD_ID,
  name: "Hod",
  deck: "A",
  number: 77,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: [
    "When you play this card, you immediately get 1 <CLAY>. Each time any player (including you) uses the __Pig Market__ accumulation space, you immediately get 2 <CLAY>.",
  ],
  cost: { wood: 1 },
})
