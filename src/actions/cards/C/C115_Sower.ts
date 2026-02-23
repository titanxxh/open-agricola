import { Occupation } from '../types'

export const C115_Sower = new Occupation({
  id: "C115_Sower",
  name: "Sower",
  deck: "C",
  number: 115,
  category: "CROP_PROVIDER",
  desc: ["Each time you build a major improvement, place 1 <REED> from the general supply on this card. At any time, you can move the <REED> to your supply or exchange it for a __Sow__ action."],
  cost: {},
  players: "1+",
})
