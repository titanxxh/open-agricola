import type { MajorCardEffect } from './types'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'

export const well: MajorCardEffect = {
  id: 'Major_Well',
  cost: { wood: 1, stone: 3 },
  vp: 4,
  extraVp: false,
  description: ['[Put 1 <FOOD> on the 5 next turns. At the start of each turn, collect the <FOOD>]'],
  onBuy: (state, player) => {
    return queueFutureMeeplesFlow(state, {
      cardId: 'Major_Well',
      playerId: player.id,
      startRound: state.round + 1,
      count: 5,
      resources: { food: 1 },
    })
  },
}
