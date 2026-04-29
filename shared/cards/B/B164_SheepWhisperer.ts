import { Occupation } from '../types'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'B164_SheepWhisperer'

export const B164_SheepWhisperer = new Occupation({
  id: CARD_ID,
  name: 'Sheep Whisperer',
  deck: 'B',
  number: 164,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Add 2, 5, 8, and 10 to the current round and place 1 <SHEEP> on each corresponding round space. At the start of these rounds, you get the <SHEEP>.'],
  cost: {},
  players: '4+',
})

export const B164_SheepWhisperer_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const base = state.round
    const entries = [base + 2, base + 5, base + 8, base + 10]
      .filter((r) => r <= 14)
      .map((round) => ({ round, resources: { sheep: 1 } }))
    if (entries.length === 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries,
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
