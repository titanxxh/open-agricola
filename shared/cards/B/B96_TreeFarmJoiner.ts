import { Occupation } from '../types'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B96_TreeFarmJoiner'

export const B96_TreeFarmJoiner = new Occupation({
  id: CARD_ID,
  name: 'Tree Farm Joiner',
  deck: 'B',
  number: 96,
  category: 'ACTIONS_BOOSTER',
  desc: ['Place 1 <WOOD> on each of the next 2 odd-numbered round spaces. At the start of these rounds, you get the <WOOD> and, immediately afterward, a __Minor Improvement__ action.'],
  cost: {},
  players: '1+',
})

export const B96_TreeFarmJoiner_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const cur = state.round
    // Find next 2 odd round numbers > current
    const oddRounds: number[] = []
    for (let r = cur + 1; r <= 14 && oddRounds.length < 2; r++) {
      if (r % 2 !== 0) oddRounds.push(r)
    }
    if (oddRounds.length === 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: oddRounds.map((round) => ({ round, resources: { wood: 1 } })),
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
