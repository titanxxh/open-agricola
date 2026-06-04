import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E122_Cottar'
const listener: CardListenerRegistration = {
  id: 'E122-cottar-after-pay',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['pay'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const ctx = context as unknown as { costType?: string }
    const costType = ctx.costType
    if (costType !== 'major-improvement' && costType !== 'minor-improvement') return
    return {
      flow: {
        type: 'xor',
        children: [
          gainLeaf(CARD_ID, { wood: 1 }),
          gainLeaf(CARD_ID, { clay: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E122_Cottar = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Cottar',
    deck: 'E',
    number: 122,
    category: 'BUILDING_RESOURCES_-_CLAY',
    desc: [
        'Each time you play or build an improvement, you get your choice of 1 <WOOD> or 1 <CLAY> immediately after paying its cost.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const E122_Cottar_impl = E122_Cottar.impl
