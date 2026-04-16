import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C38_Christianity'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'leaf' as const,
      actionId: 'gain-other-players',
      sourceCard: CARD_ID,
      params: { food: 1 },
    }
  },
})

export const C38_Christianity = new MinorImprovement({
  id: CARD_ID,
  name: "Christianity",
  deck: "C",
  number: 38,
  category: "POINTS_PROVIDER",
  desc: ["When you play this card, all other players get 1 <FOOD> each."],
  vp: 2,
  prerequisite: "Exactly 1 Sheep",
  newSet: true,
})
