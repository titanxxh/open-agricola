import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { createEventQuery } from '../../events/query'
import { getCardDefinitionById } from '../helpers/card-type'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D056_FatstockStretcher'
const afterExchangeListener: CardListenerRegistration = {
  id: 'D56-fatstock-stretcher-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['exchange'],
  handler: (context): ActionHookResult | void => {
    const bonus = createEventQuery(context.actionEvents ?? context.transactionEvents)
      .filter('resource.exchanged', (event) =>
        event.paidFrom.kind === 'player' && event.paidFrom.playerId === context.player.id &&
        (event.gained.food ?? 0) > 0 && !!getCardDefinitionById(event.exchangeSource ?? '')?.isCookery,
      ).reduce((sum, event) => sum + (event.paid.sheep ?? 0) + (event.paid.boar ?? 0), 0)
    if (bonus <= 0) return
    return {
      flow: gainLeaf(CARD_ID, { food: bonus }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [afterExchangeListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D056_FatstockStretcher = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Fatstock Stretcher',
    deck: 'D',
    number: 56,
    category: 'FOOD_PROVIDER',
    desc: ['Each time you turn a <SHEEP> or <PIG> into <FOOD> using a cooking improvement, you get 1 additional <FOOD>.'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const D056_FatstockStretcher_impl = D056_FatstockStretcher.impl
