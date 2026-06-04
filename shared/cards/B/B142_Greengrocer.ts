import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B142_Greengrocer'
const listener: CardListenerRegistration = {
  id: 'B142-greengrocer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'grain-seeds') return
    return { flow: gainLeaf(CARD_ID, { vegetable: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B142_Greengrocer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Greengrocer',
    deck: 'B',
    number: 142,
    category: 'CROP_PROVIDER',
    desc: ['Each time you use the __Grain Seeds__ action space, you also get 1 <VEGETABLE>.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const B142_Greengrocer_impl = B142_Greengrocer.impl
