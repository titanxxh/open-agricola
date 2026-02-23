import { MinorImprovement } from '../types'

export const A65_SeedPellets = new MinorImprovement({
  id: "A65_SeedPellets",
  name: "Seed Pellets",
  deck: "A",
  number: 65,
  category: "CROP_PROVIDER",
  desc: ["Each time before you take an unconditional __Sow__ action, you get 1 <GRAIN>."],
  cost: {},
  prerequisite: "3 Fields",
})
