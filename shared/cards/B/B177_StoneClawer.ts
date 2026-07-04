import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B177_StoneClawer'
const listener: CardListenerRegistration = {
  id: 'B177-stone-clawer-after-plow',
  cardIds: [CARD_ID],
  actions: ['plow'],
  phases: ['after' as ActionHookPhase],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B177_StoneClawer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Stone Clawer',
    deck: 'B',
    number: 177,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Each time you plow at least 1 <FIELD>, you also get 1 <STONE>.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const B177_StoneClawer_impl = B177_StoneClawer.impl
