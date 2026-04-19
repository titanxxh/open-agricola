import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'A19_Handplow'
const TARGET_ROUND_KEY = 'targetRound'

// A19 Handplow: onBuy adds 5 to current round and places a field marker on that round space.
// At the start of that round, the player can plow 1 field.
registerCardEffect({
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
})

export const A19_Handplow = new MinorImprovement({
  id: CARD_ID,
  name: 'Handplow',
  deck: 'A',
  number: 19,
  category: 'FARM_PLANNER',
  desc: ['Add 5 to the current round and place 1 field tile on the corresponding round space. At the start of that round, you can plow the field.'],
  cost: { wood: 1 },
})
