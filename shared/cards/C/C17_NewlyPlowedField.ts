import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C17_NewlyPlowedField'

export const C17_NewlyPlowedField = new MinorImprovement({
  id: "C17_NewlyPlowedField",
  name: "Newly-Plowed Field",
  deck: "C",
  number: 17,
  category: "FARM_PLANNER",
  desc: ["When you play this card, you can immediately plow 1 field, which needs not be adjacent to another field."],
  cost: {},
  prerequisite: "Exactly 3 Field Tiles",
  newSet: true,
})

export const C17_NewlyPlowedField_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'leaf',
      actionId: 'plow',
      optional: true,
      sourceCard: CARD_ID,
      actionContext: { unrestricted: true, trueAction: false },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
