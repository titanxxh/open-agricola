import { MinorImprovement } from '../types'
import { fieldIsEmpty } from '../../game/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'C6_StoneClearing'

export const C6_StoneClearing = new MinorImprovement({
  id: CARD_ID,
  name: "Stone Clearing",
  deck: "C",
  number: 6,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Immediately place 1 <STONE> on each of your empty fields. Harvest them during the next field phase. These fields are considered planted until then."],
  cost: { food: 1 },
  passing: true,
})

export const C6_StoneClearing_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const emptyFields = player.fields.filter((f) => fieldIsEmpty(f)).length
    if (emptyFields === 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { stone: emptyFields },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
