import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { A19_Handplow } from '../../cards-display/A/A19_Handplow'
export { A19_Handplow }

const CARD_ID = A19_Handplow.id

const TARGET_ROUND_KEY = 'targetRound'

export const A19_Handplow_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const targetRound = Math.min(14, state.round + 5)
    writeCardExtraData(player, CARD_ID, TARGET_ROUND_KEY, targetRound)
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [{ round: targetRound, resources: {} }],
    })
  },
  onRoundStart: (state, player) => {
    const targetRound = readCardExtraData<number>(player, CARD_ID, TARGET_ROUND_KEY)
    if (targetRound !== state.round) return
    writeCardExtraData(player, CARD_ID, TARGET_ROUND_KEY, undefined)
    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
      ],
    } as ActionFlow
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
