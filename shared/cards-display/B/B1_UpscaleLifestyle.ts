import { MinorImprovement } from '../types'

const CARD_ID = 'B1_UpscaleLifestyle'

export const B1_UpscaleLifestyle = new MinorImprovement({
  id: CARD_ID,
  name: "Upscale Lifestyle",
  deck: "B",
  number: 1,
  category: "FARM_PLANNER",
  desc: ["You immediately get 5 <CLAY> and a __Renovation__ action. If you take the action, you must pay the renovation cost."],
  cost: { wood: 3 },
  passing: true,
})
