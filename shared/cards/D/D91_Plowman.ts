import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D91_Plowman } from '../../cards-display/D/D91_Plowman'
export { D91_Plowman }

const CARD_ID = D91_Plowman.id

export const D91_Plowman_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const offsets = [4, 7, 10]
    const targetRounds = offsets
      .map((offset) => state.round + offset)
      .filter((r) => r <= 14)
    if (targetRounds.length === 0) return
    writeCardExtraData(player, CARD_ID, 'targetRounds', targetRounds)
    const entries = targetRounds.map((round) => ({ round, resources: {} }))
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries,
    })
  },
  onRoundStart: (state, player) => {
    const targetRounds = readCardExtraData<number[]>(player, CARD_ID, 'targetRounds') ?? []
    if (!targetRounds.includes(state.round)) return
    if ((player.resources.food ?? 0) < 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
        { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
