import { Occupation } from '../types'

const CARD_ID = 'C144_ReedRoofRenovator'

export const C144_ReedRoofRenovator = new Occupation({
  id: CARD_ID,
  name: "Reed Roof Renovator",
  deck: "C",
  number: 144,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: [
    "Each time another player renovates, you immediately get 1 <REED> from the general supply. When you play this card in a 3-player game, you immediately get 1 <REED>.",
  ],
  players: "3+",
})
