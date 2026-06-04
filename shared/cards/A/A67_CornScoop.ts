import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A67_CornScoop'
const listener: CardListenerRegistration = {
  id: 'A67-corn-scoop-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || context.space.id !== 'grain-seeds') return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A67_CornScoop = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Corn Scoop',
    deck: 'A',
    number: 67,
    category: 'CROP_PROVIDER',
    desc: ['Each time you use the __Grain Seeds__ action space, you get 1 additional <GRAIN>.'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const A67_CornScoop_impl = A67_CornScoop.impl
