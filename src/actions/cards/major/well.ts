import type { MajorCardEffect } from './types'
import { futureMeeplesNode, queueFutureMeeples } from '../../effects/future-meeples'

export const well: MajorCardEffect = {
  id: 'Major_Well',
  cost: { wood: 1, stone: 3 },
  vp: 4,
  extraVp: false,
  description: ['At the start of the next 5 rounds, gain 1 food'],
  onBuy: (state, player) => {
    queueFutureMeeples(state, {
      cardId: 'Major_Well',
      playerId: player.id,
      startRound: state.round + 1,
      count: 5,
      resources: { food: 1 },
    })
    return futureMeeplesNode()
  },
}
