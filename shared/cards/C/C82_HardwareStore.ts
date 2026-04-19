import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'

const CARD_ID = 'C82_HardwareStore'

// C82 Hardware Store: After Day Laborer, optionally pay 2 food to get 1 wood + 1 clay + 1 reed + 1 stone.
// Uses after phase (onPlayerAfterPlaceFarmer in BGA = after phase with higher order).
const listener: CardListenerRegistration = {
  id: 'C82-hardware-store-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  order: 10,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    return payGainNode({
      cardId: CARD_ID,
      cost: { food: 2 },
      gain: { wood: 1, clay: 1, reed: 1, stone: 1 },
    })
  },
}

registerCardListener(listener)

export const C82_HardwareStore = new MinorImprovement({
  id: CARD_ID,
  name: 'Hardware Store',
  deck: 'C',
  number: 82,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time after you use the __Day Laborer__ action space, you can pay 2 <FOOD> total to buy 1 <WOOD>, 1 <CLAY>, 1 <REED>, and 1 <STONE>.'],
  vp: 1,
  cost: { wood: 1, clay: 1 },
  newSet: true,
})
