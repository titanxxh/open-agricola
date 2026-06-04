import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'D5_FieldClay'

const cardImpl = {
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

export const D5_FieldClay = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Field Clay",
    deck: "D",
    number: 5,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["You immediately get 1 <CLAY> for each planted field you have."],
    cost: { food: 1 },
    passing: true,
    prerequisite: "1 Planted Field",
  },
  impl: cardImpl,
})

export const D5_FieldClay_impl = D5_FieldClay.impl
