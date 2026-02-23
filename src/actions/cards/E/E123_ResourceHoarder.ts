import { Occupation } from '../types'

export const E123_ResourceHoarder = new Occupation({
  id: "E123_ResourceHoarder",
  name: "Resource Hoarder",
  deck: "E",
  number: 123,
  desc: ["Pile resources as depicted on this card. You can use the top item(s) when building a room, playing/building an improvement, or renovating. (From bottom to top: <STONE>, <CLAY>, <STONE>, <REED>, <WOOD>, <CLAY>)"],
  cost: {},
  players: "1+",
})
