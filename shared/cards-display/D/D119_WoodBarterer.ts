import { Occupation } from '../types'

const CARD_ID = 'D119_WoodBarterer'

export const D119_WoodBarterer = new Occupation({
  id: CARD_ID,
  name: "Wood Barterer",
  deck: "D",
  number: 119,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time before you use an action space with a __Build Fences__ or __Build Rooms__ action, you can choose to either get 2 <WOOD> or exchange up to 2 <WOOD> for 1 <REED> each."],
  cost: {},
  players: "1+",
})
