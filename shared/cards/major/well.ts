import type { MajorCardData } from './types'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'

export const well: MajorCardData = {
  id: 'Major_Well',
  name: 'Well',
  deck: 'major',
  number: 7,
  cost: { wood: 1, stone: 3 },
  vp: 4,
  extraVp: false,
  desc: ['[Put 1 <FOOD> on the 5 next turns. At the start of each turn, collect the <FOOD>]'],
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
