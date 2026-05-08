import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { A89_StablePlanner } from '../../cards-display/A/A89_StablePlanner'
export { A89_StablePlanner }

const CARD_ID = A89_StablePlanner.id

const TARGET_ROUNDS_KEY = 'targetRounds'

export const A89_StablePlanner_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const offsets = [3, 6, 9]
    const targets = offsets
      .map((o) => state.round + o)
      .filter((r) => r <= 14)
    if (targets.length === 0) return
    writeCardExtraData(player, CARD_ID, TARGET_ROUNDS_KEY, targets)
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: targets.map((round) => ({ round, resources: {} })),
    })
  },
  onRoundStart: (state, player) => {
    const targets = readCardExtraData<number[]>(player, CARD_ID, TARGET_ROUNDS_KEY)
    if (!targets || !targets.includes(state.round)) return
    const remaining = targets.filter((r) => r !== state.round)
    writeCardExtraData(player, CARD_ID, TARGET_ROUNDS_KEY, remaining)
    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'stables',
          params: { max: 1, costOverride: {} },
          sourceCard: CARD_ID,
        },
      ],
    } as ActionFlow
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
