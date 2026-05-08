import { MinorImprovement } from '../types'

const CARD_ID = 'A65_SeedPellets'

export const A65_SeedPellets = new MinorImprovement({
  id: CARD_ID,
  name: "Seed Pellets",
  deck: "A",
  number: 65,
  category: "CROP_PROVIDER",
  desc: ["Each time before you take an unconditional __Sow__ action, you get 1 <GRAIN>."],
  cost: {},
  prerequisite: "3 Fields",
})
