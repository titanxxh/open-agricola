import { MinorImprovement } from '../types'

const CARD_ID = 'A80_StoneTongs'

export const A80_StoneTongs = new MinorImprovement({
  id: CARD_ID,
  name: "Stone Tongs",
  deck: "A",
  number: 80,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: [
    "Each time you use a stone accumulation space, you get 1 additional <STONE>.",
  ],
  cost: { wood: 1 },
})
