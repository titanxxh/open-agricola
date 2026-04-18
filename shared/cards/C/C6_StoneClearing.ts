import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { fieldIsEmpty } from '../../game/field'

const CARD_ID = 'C6_StoneClearing'

// BGA: Immediately place 1 stone on each empty field (complex SPECIAL_EFFECT).
// Simplified: gain 1 stone per empty field tile the player has.
registerCardEffect({
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
})

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
