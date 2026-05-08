import { MinorImprovement } from '../types'

const CARD_ID = 'B65_GrainDepot'

export const B65_GrainDepot = new MinorImprovement({
  id: CARD_ID,
  name: "Grain Depot",
  deck: "B",
  number: 65,
  category: "CROP_PROVIDER",
  desc: ["If you paid <WOOD>/<CLAY>/<STONE> for this card, place 1 <GRAIN> on each of the next 2/3/4 round spaces. At the start of these rounds, you get the <GRAIN>."],
  cost: {},
  altCosts: [{ wood: 2 }, { clay: 2 }, { stone: 2 }],
})
