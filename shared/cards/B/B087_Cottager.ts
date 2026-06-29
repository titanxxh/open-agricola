import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B087_Cottager'
const listener: CardListenerRegistration = {
  id: 'B87-cottager-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    const children: ActionFlow[] = [
      { type: 'leaf', actionId: 'construct', optional: false, sourceCard: CARD_ID, actionContext: { max: 1, trueAction: false } },
      { type: 'leaf', actionId: 'renovate-house', sourceCard: CARD_ID },
    ]
    return {
      flow: {
        type: 'xor',
        optional: true,
        children,
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B087_Cottager = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Cottager',
    deck: 'B',
    number: 87,
    category: 'FARM_PLANNER',
    desc: ['Each time you use the __Day Laborer__ action space, you can also either build exactly 1 room or renovate your house. Either way, you have to pay the cost.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B087_Cottager_impl = B087_Cottager.impl
