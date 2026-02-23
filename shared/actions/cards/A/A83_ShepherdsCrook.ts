import { MinorImprovement } from '../types'

export const A83_ShepherdsCrook = new MinorImprovement({
  id: "A83_ShepherdsCrook",
  name: "Shepherd's Crook",
  deck: "A",
  number: 83,
  category: "LIVESTOCK_PROVIDER",
  desc: ["Each time you fence a new pasture covering at least 4 farmyard spaces, you immediately get 2 sheep on this pasture."],
  cost: {"wood":1},
})
