import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C082_HardwareStore'
const listener: CardListenerRegistration = {
  id: 'C82-hardware-store-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    return payGainNode({
      cardId: CARD_ID,
      cost: { food: 2 },
      gain: { wood: 1, clay: 1, reed: 1, stone: 1 },
    })
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C082_HardwareStore = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Hardware Store',
    deck: 'C',
    number: 82,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Each time after you use the __Day Laborer__ action space, you can pay 2 <FOOD> total to buy 1 <WOOD>, 1 <CLAY>, 1 <REED>, and 1 <STONE>.'],
    vp: 1,
    cost: { wood: 1, clay: 1 },
  },
  impl: cardImpl,
})

export const C082_HardwareStore_impl = C082_HardwareStore.impl
