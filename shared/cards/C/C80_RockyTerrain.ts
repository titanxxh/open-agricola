import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'

const CARD_ID = 'C80_RockyTerrain'

/**
 * C80 Rocky Terrain:
 * Each time you plow a field (tile or card), you can buy 1 STONE for 1 FOOD.
 *
 * BGA triggers on: Plow, Improvement (if field card), Occupation (if field card).
 * In our system, plow action is 'plow'. We simplify to just plow events since
 * field cards are not commonly implemented.
 */
const plowListener: CardListenerRegistration = {
  id: 'C80-rocky-terrain-after-plow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['plow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.resources.food < 1) return
    return payGainNode({
      cardId: CARD_ID,
      cost: { food: 1 },
      gain: { stone: 1 },
    })
  },
}

registerCardListener(plowListener)

export const C80_RockyTerrain = new MinorImprovement({
  id: CARD_ID,
  name: 'Rocky Terrain',
  deck: 'C',
  number: 80,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you plow a field (tile or card), you can also buy 1 <STONE> for 1 <FOOD>.'],
  cost: { food: 1 },
  players: '1+',
  newSet: true,
})
