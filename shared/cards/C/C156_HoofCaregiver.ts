import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C156_HoofCaregiver'

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

export const C156_HoofCaregiver_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { grain: 1, food: 1 },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
