import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E137_FlaxFarmer'
const listener: CardListenerRegistration = {
  id: 'E137-flax-farmer-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId === 'reed-bank') {
      return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
    }
    if (spaceId === 'grain-seeds') {
      return { flow: gainLeaf(CARD_ID, { reed: 1 }), sourceCard: CARD_ID }
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E137_FlaxFarmer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Flax Farmer',
    deck: 'E',
    number: 137,
    category: 'GOODS_-_GET',
    desc: ['Each time you use the __Reed Bank__ accumulation space, you also get 1\u00a0<GRAIN>. Each time you use the __Grain Seeds__ action space, you also get 1 <REED>.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const E137_FlaxFarmer_impl = E137_FlaxFarmer.impl
