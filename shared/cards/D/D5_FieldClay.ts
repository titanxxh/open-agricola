import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldIsEmpty } from '../../game/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'D5_FieldClay'

export const D5_FieldClay = new MinorImprovement({
  id: CARD_ID,
  name: "Field Clay",
  deck: "D",
  number: 5,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get 1 <CLAY> for each planted field you have."],
  cost: { food: 1 },
  passing: true,
  prerequisite: "1 Planted Field",
})

export const D5_FieldClay_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const plantedCount = player.fields.filter((f) => !fieldIsEmpty(f)).length
    if (plantedCount > 0) {
      return { type: 'seq', children: [gainLeaf(CARD_ID, { clay: plantedCount })] }
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
