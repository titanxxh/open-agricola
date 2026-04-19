import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'B18_GrasslandHarrow'
const TARGET_ROUND_KEY = 'targetRound'

// B18 Grassland Harrow: Add 1 to the current round for each building resource
// (WOOD, STONE, CLAY, REED) in your supply (after payment) and place 1 field
// on the corresponding round space. At the start of the round, you can plow
// the field.
//
// BGA source: onPlayerAfterPay fires after paying for this card, counts the
// remaining building resources (+1 per resource) and calls futureMeeplesNode
// with ['+N']. Payment is completed in our onBuy hook before it runs, so we
// look at player.resources at onBuy time.
registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const buildingResources =
      (player.resources.wood ?? 0) +
      (player.resources.stone ?? 0) +
      (player.resources.clay ?? 0) +
      (player.resources.reed ?? 0)
    if (buildingResources <= 0) return
    const targetRound = Math.min(14, state.round + buildingResources)
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

export const B18_GrasslandHarrow = new MinorImprovement({
  id: CARD_ID,
  name: 'Grassland Harrow',
  deck: 'B',
  number: 18,
  category: 'FARM_PLANNER',
  desc: [
    'Add 1 to the current round for each building resource in your supply and place 1 field on the corresponding round space. At the start of the round, you can plow the field.',
  ],
  cost: { wood: 2 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  evenMoreSet: true,
})
