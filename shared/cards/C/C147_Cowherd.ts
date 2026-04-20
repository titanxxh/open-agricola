import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C147_Cowherd'

const listener: CardListenerRegistration = {
  id: 'C147-cowherd-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'cattle-market') return
    return { flow: gainLeaf(CARD_ID, { cattle: 1 }), sourceCard: CARD_ID }
  },
}

export const C147_Cowherd = new Occupation({
  id: CARD_ID,
  name: 'Cowherd',
  deck: 'C',
  number: 147,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Each time you use the __Cattle Market__ accumulation space, you get 1 additional <CATTLE>.'],
  cost: {},
  players: '3+',
})

export const C147_Cowherd_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
