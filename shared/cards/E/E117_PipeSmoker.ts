import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop } from '../../game/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'E117_PipeSmoker'

export const E117_PipeSmoker = new Occupation({
  id: CARD_ID,
  name: "Pipe Smoker",
  deck: "E",
  number: 117,
  category: "BUILDING_RESOURCES_-_WOOD",
  desc: ['At the start of each harvest, if you have at least 1 grain field, you get 2\u00a0<WOOD>.'],
  cost: {},
  players: "1+",
})

export const E117_PipeSmoker_impl = {
  effect: {
  id: CARD_ID,
  onStartHarvest: (_state, player) => {

    const grainFieldCount = player.fields.filter(
      (f) => fieldHasCrop(f, 'grain'),
    ).length
    if (grainFieldCount < 1) return

    return gainLeaf(CARD_ID, { wood: 2 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
