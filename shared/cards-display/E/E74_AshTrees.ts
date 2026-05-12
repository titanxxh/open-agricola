import { MinorImprovement } from '../types'

const CARD_ID = 'E74_AshTrees'

export const E74_AshTrees = new MinorImprovement({
  id: CARD_ID,
  name: "Ash Trees",
  deck: "E",
  number: 74,
  desc: ["When you play this card, immediately place (up to) 5 fences from your supply on it. When you build fences, fences taken from this card cost you nothing."],
  cost: {},
  prerequisite: "2 Planted Fields",
  category: 'BUILDING_RESOURCES_-_WOOD',
})
