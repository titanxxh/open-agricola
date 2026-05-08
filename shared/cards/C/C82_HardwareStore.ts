import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C82_HardwareStore } from '../../cards-display/C/C82_HardwareStore'

const CARD_ID = C82_HardwareStore.id

const listener: CardListenerRegistration = {
  id: 'C82-hardware-store-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  order: 10,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    return payGainNode({
      cardId: CARD_ID,
      cost: { food: 2 },
      gain: { wood: 1, clay: 1, reed: 1, stone: 1 },
    })
  },
}

export const C82_HardwareStore_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
