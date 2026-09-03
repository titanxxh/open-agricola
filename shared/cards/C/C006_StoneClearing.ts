import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { getLogicalFields, mutateLogicalFields } from '../helpers/card-field'

const CARD_ID = 'C006_StoneClearing'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const mutations = mutateLogicalFields(state, player, {
        sourceCard: CARD_ID,
        allowNonSowCrop: true,
      })
      for (const field of getLogicalFields(player)) {
        if (field.stacks.length === 0) mutations.place({ fieldId: field.id }, 'stone', 1)
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C006_StoneClearing = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Stone Clearing",
    deck: "C",
    number: 6,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["Immediately place 1 <STONE> on each of your empty <FIELD>. Harvest them during the next field phase. These <FIELD> are considered planted until then."],
    cost: { food: 1 },
    passing: true,
  },
  impl: cardImpl,
})

export const C006_StoneClearing_impl = C006_StoneClearing.impl
