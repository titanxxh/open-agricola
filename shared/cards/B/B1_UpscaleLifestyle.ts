import { MinorImprovement } from '../types'

export const B1_UpscaleLifestyle = new MinorImprovement({
  id: "B1_UpscaleLifestyle",
  name: "Upscale Lifestyle",
  deck: "B",
  number: 1,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Immediately receive 1 <FOOD> for every 3 <STONE> in your supply."],
  cost: { food: 1 },
  passing: true,
})
