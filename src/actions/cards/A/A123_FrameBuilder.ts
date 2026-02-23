import { Occupation } from '../types'

export const A123_FrameBuilder = new Occupation({
  id: "A123_FrameBuilder",
  name: "Frame Builder",
  deck: "A",
  number: 123,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time you build a room/renovate, but only once per room/action, you can replace exactly 2 <CLAY> or 2 <STONE> with 1 <WOOD>."],
  cost: {},
  players: "1+",
})
