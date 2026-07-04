import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C176_Cleanacre'
const CLEANACRE_SPACES = new Set(['farmland', 'cultivation', 'farm-supplies-6'])
const listener: CardListenerRegistration = {
  id: 'C176-cleanacre-after-action-space',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!CLEANACRE_SPACES.has(context.space?.id ?? '')) return
    return { flow: gainLeaf(CARD_ID, { clay: 2 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C176_Cleanacre = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Cleanacre',
    deck: 'C',
    number: 176,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Each time you use the __Farmland__, __Cultivation__, or __Farm Supplies__ action (the latter only being available with 6 players), you also get 2 <CLAY>.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const C176_Cleanacre_impl = C176_Cleanacre.impl
