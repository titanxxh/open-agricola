import { MinorImprovement } from '../types'

export const B2_MiniPasture = new MinorImprovement({
  id: "B2_MiniPasture",
  name: "Mini Pasture",
  deck: "B",
  number: 2,
  category: "FARM_PLANNER",
  desc: ["Immediately fence a farmyard space, without paying <WOOD> for the fences. (If you already have pastures, the new one must be adjacent to an existing one.)"],
  cost: {"food":2},
  passing: true,
})
