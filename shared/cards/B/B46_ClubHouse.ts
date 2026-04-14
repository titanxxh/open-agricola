import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'

const CARD_ID = 'B46_ClubHouse'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const base = state.round
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: base + 1, resources: { food: 1 } },
        { round: base + 2, resources: { food: 1 } },
        { round: base + 3, resources: { food: 1 } },
        { round: base + 4, resources: { food: 1 } },
        { round: base + 5, resources: { stone: 1 } },
      ],
    })
  },
})

export const B46_ClubHouse = new MinorImprovement({
  id: CARD_ID,
  name: 'Club House',
  deck: 'B',
  number: 46,
  category: 'FOOD_MISC',
  desc: ['Place 1 <FOOD> on each of the next 4 round spaces and 1 <STONE> on the round space after that. At the start of these rounds, you get the respective good.'],
  cost: {},
  altCosts: [{ wood: 3 }, { clay: 2 }],
  vp: 1,
})
