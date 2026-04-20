import { MinorImprovement } from '../types'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { ActionFlow } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A19_Handplow'
const TARGET_ROUND_KEY = 'targetRound'

export const A19_Handplow = new MinorImprovement({
  id: CARD_ID,
  name: 'Handplow',
  deck: 'A',
  number: 19,
  category: 'FARM_PLANNER',
  desc: ['Add 5 to the current round and place 1 field tile on the corresponding round space. At the start of that round, you can plow the field.'],
  cost: { wood: 1 },
})

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
