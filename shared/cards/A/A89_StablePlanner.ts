import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'A89_StablePlanner'
const TARGET_ROUNDS_KEY = 'targetRounds'

// A89 Stable Planner: onBuy places stable markers on round+3, +6, +9 spaces.
// At the start of those rounds, player can build 1 stable at no cost.
registerCardEffect({
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
    if (!player.occupationPlayed.includes(CARD_ID)) return
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
})

export const A89_StablePlanner = new Occupation({
  id: CARD_ID,
  name: 'Stable Planner',
  deck: 'A',
  number: 89,
  category: 'FARM_PLANNER',
  desc: ['Add 3, 6, and 9 to the current round. You can place 1 stable on each corresponding round space. At the start of these rounds (not earlier), you can build the stable at no cost.'],
  cost: {},
  players: '1+',
  newSet: true,
})
