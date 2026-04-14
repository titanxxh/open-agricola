import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C156_HoofCaregiver'

// BGA: Adds 1 cattle to Cattle Market accumulation space, then gains 1 grain + 1 food
// per cattle on that space. We don't have the Cattle Market action space model here,
// so simplified: gain 1 grain + 1 food immediately (as if 1 cattle was on the space).
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { grain: 1, food: 1 },
    }
  },
})

export const C156_HoofCaregiver = new Occupation({
  id: CARD_ID,
  name: "Hoof Caregiver",
  deck: "C",
  number: 156,
  category: "GOODS_PROVIDER",
  desc: ["Immediately add 1 <CATTLE> from the general supply to the __Cattle Market__ accumulation space. Afterward, for each cattle on __Cattle Market__, you get 1 <GRAIN> plus 1 <FOOD>."],
  cost: {},
  players: "4+",
  newSet: true,
})
