import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C076_WoodCart'
const isWoodAccumulationSpace = (context: CardListenerContext): boolean =>
  (context.space?.gainPerRound?.wood ?? 0) > 0

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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C076_WoodCart = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Wood Cart',
    deck: 'C',
    number: 76,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Each time you use a <WOOD> accumulation space, you get 2 additional <WOOD>.'],
    cost: { wood: 3 },
    prerequisite: '3 Occupations',
    occupationPrerequisites: { min: 3 },
  },
  impl: cardImpl,
})

export const C076_WoodCart_impl = C076_WoodCart.impl
