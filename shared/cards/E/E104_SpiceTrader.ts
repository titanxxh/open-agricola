import { Occupation } from '../types'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'E104_SpiceTrader'

export const E104_SpiceTrader = new Occupation({
  id: CARD_ID,
  name: 'Spice Trader',
  deck: 'E',
  number: 104,
  category: 'GOODS_-_GET',
  desc: ['If you play this card in round 4 or before, place 3 <VEGETABLE> on the space for round 11. At the start of that round, you get the <VEGETABLE>.'],
  players: '1+',
})

export const E104_SpiceTrader_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    if (state.round >= 5) return
    if (11 <= state.round) return

    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [{ round: 11, resources: { vegetable: 3 } }],
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
