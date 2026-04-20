import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D104_Cultivator'

// D104 Cultivator: For each new field tile you get, you also get 1 WOOD and 1 FOOD.
// Triggers after the plow action each time.
const listener: CardListenerRegistration = {
  id: 'D104-cultivator-after-plow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['plow'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { wood: 1, food: 1 }), sourceCard: CARD_ID }
  },
}

export const D104_Cultivator = new Occupation({
  id: CARD_ID,
  name: 'Cultivator',
  deck: 'D',
  number: 104,
  category: 'GOODS_PROVIDER',
  desc: ['For each new field tile you get, you also get 1 <WOOD> and 1 <FOOD>.'],
  cost: {},
  players: '1+',
})

export const D104_Cultivator_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
