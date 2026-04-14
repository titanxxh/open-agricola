import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'

const CARD_ID = 'B125_EstateWorker'

// BGA: place wood/clay/reed/stone on next 4 rounds in that order.
registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const base = state.round
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: base + 1, resources: { wood: 1 } },
        { round: base + 2, resources: { clay: 1 } },
        { round: base + 3, resources: { reed: 1 } },
        { round: base + 4, resources: { stone: 1 } },
      ],
    })
  },
})

export const B125_EstateWorker = new Occupation({
  id: CARD_ID,
  name: 'Estate Worker',
  deck: 'B',
  number: 125,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Place 1 <WOOD>, 1 <CLAY>, 1 <REED>, and 1 <STONE> in this order on the next 4 round spaces. At the start of these rounds, you get the respective building resource.'],
  cost: {},
  players: '1+',
})
