import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E117_PipeSmoker'

registerCardEffect({
  id: CARD_ID,
  onStartHarvest: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return

    const grainFieldCount = player.fields.filter(
      (f) => f.crop === 'grain' && f.remaining > 0,
    ).length
    if (grainFieldCount < 1) return

    return gainLeaf(CARD_ID, { wood: 2 })
  },
})

export const E117_PipeSmoker = new Occupation({
  id: CARD_ID,
  name: "Pipe Smoker",
  deck: "E",
  number: 117,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ['At the start of each harvest, if you have at least 1 grain field, you get 2\u00a0<WOOD>.'],
  cost: {},
  players: "1+",
})
