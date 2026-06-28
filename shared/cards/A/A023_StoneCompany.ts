import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'A023_StoneCompany'
const QUARRY_SPACES = new Set(['eastern-quarry', 'western-quarry'])

const listener: CardListenerRegistration = {
  id: 'A23-stone-company-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !QUARRY_SPACES.has(context.space.id)) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'improvement',
            sourceCard: CARD_ID,
            actionContext: { purchaseCondition: CARD_ID },
          },
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

export const A023_StoneCompany = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Stone Company",
    deck: "A",
    number: 23,
    category: "ACTIONS_BOOSTER",
    desc: ["Immediately after each time you use a __Quarry__ accumulation space, you get a __Major or Minor Improvement__ action during which you must spend at least 1 <STONE>."],
    cost: { clay: 2, reed: 1 },
    vp: 1,
  },
  impl: cardImpl,
})

export const A023_StoneCompany_impl = A023_StoneCompany.impl
