import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'

const CARD_ID = 'B20_ChainFloat'

// BGA: add rounds current+7, +8, +9 and place 1 field on each. At start of those rounds, player can plow.
// Simplified: place future plow actions on next 3 rounds (relative +7/+8/+9).
// TODO: implement field-plow future effect properly.
registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const base = state.round
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: base + 7, resources: {} },
        { round: base + 8, resources: {} },
        { round: base + 9, resources: {} },
      ],
    })
  },
})

export const B20_ChainFloat = new MinorImprovement({
  id: CARD_ID,
  name: 'Chain Float',
  deck: 'B',
  number: 20,
  category: 'FARM_PLANNER',
  desc: ['Add 7, 8, and 9 to the current round and place 1 field on each corresponding round space. At the start of these rounds, you can plow the field.'],
  cost: { wood: 3 },
})
