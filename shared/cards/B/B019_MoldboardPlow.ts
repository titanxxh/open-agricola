import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'B019_MoldboardPlow'
const listener: CardListenerRegistration = {
  id: 'B19-moldboard-plow-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'farmland') return
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    pushToCardStack(player, CARD_ID, ['field', 'field'])
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B019_MoldboardPlow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Moldboard Plow',
    deck: 'B',
    number: 19,
    category: 'FARM_PLANNER',
    desc: ['Place 2 <FIELD> tiles on this card. Twice this game, when you use the __Farmland__ action space, you can also plow 1 <FIELD> from this card.'],
    cost: { wood: 2 },
    prerequisite: '1 Occupation',
    occupationPrerequisites: { min: 1 },
  },
  presentation: { stack: true },
  impl: cardImpl,
})

export const B019_MoldboardPlow_impl = B019_MoldboardPlow.impl
