import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A145_Ropemaker'

registerCardEffect({
  id: CARD_ID,
  onEndHarvest: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    return gainLeaf(CARD_ID, { reed: 1 })
  },
})

export const A145_Ropemaker = new Occupation({
  id: CARD_ID,
  name: "Ropemaker",
  deck: "A",
  number: 145,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["At the end of each harvest, you get 1 <REED> from the general supply."],
  cost: {},
  players: "3+",
})
