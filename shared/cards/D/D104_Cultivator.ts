import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D104_Cultivator'
const listener: CardListenerRegistration = {
  id: 'D104-cultivator-after-plow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['plow'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { wood: 1, food: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D104_Cultivator = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Cultivator',
    deck: 'D',
    number: 104,
    category: 'GOODS_PROVIDER',
    desc: ['For each new <FIELD> tile you get, you also get 1 <WOOD> and 1 <FOOD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D104_Cultivator_impl = D104_Cultivator.impl
