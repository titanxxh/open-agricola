import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C76_WoodCart'

const isWoodAccumulationSpace = (context: CardListenerContext): boolean =>
  (context.space?.gainPerRound?.wood ?? 0) > 0

// C76 Wood Cart: Each time you use a wood accumulation space, get 2 additional WOOD.
// Triggers before collect (isBeforeCollectEvent in BGA).
const listener: CardListenerRegistration = {
  id: 'C76-wood-cart-before-collect',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context)) return
    return { flow: gainLeaf(CARD_ID, { wood: 2 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const C76_WoodCart = new MinorImprovement({
  id: CARD_ID,
  name: 'Wood Cart',
  deck: 'C',
  number: 76,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you use a wood accumulation space, you get 2 additional <WOOD>.'],
  cost: { wood: 3 },
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
