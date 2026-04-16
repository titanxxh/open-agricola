import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D18_SteamPlow'

/**
 * D18 Steam Plow (Minor Improvement):
 * Immediately after each returning home phase, you can pay 2 wood and 1 food
 * to use the Farmland action space without placing a person.
 * (Farmland = plow 1 field, then optionally sow.)
 *
 * BGA reference:
 * - isListeningTo: PlayerEvent, type == ReturnHome
 * - onPlayerReturnHome: optional seq(pay 2 wood + 1 food, useActionSpace('ActionFarmland'))
 * - cost: wood 1, food 1, vp: 1
 *
 * We use onStartReturnHome to trigger at the start of the return home phase.
 * The Farmland action is: plow 1 field, then optionally sow.
 */

registerCardEffect({
  id: CARD_ID,
  onStartReturnHome: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    // Check player can afford the cost
    if ((player.resources.wood ?? 0) < 2 || (player.resources.food ?? 0) < 1) return
    return {
      type: 'seq',
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { wood: 2, food: 1 } }),
        { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
        {
          type: 'leaf',
          actionId: 'sow',
          sourceCard: CARD_ID,
          optional: true,
          actionContext: { trueAction: false },
        },
      ],
    }
  },
})

export const D18_SteamPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Steam Plow',
  deck: 'D',
  number: 18,
  category: 'FARM_PLANNER',
  desc: ['Immediately after each returning home phase, you can pay 2 <WOOD> and 1 <FOOD> to use the __Farmland__ action space without placing a person.'],
  cost: { wood: 1, food: 1 },
  vp: 1,
  newSet: true,
})
