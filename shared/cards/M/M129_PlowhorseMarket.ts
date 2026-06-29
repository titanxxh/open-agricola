import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M129_PlowhorseMarket'
const TRIGGER_SPACES = new Set(['farmland', 'cultivation'])

const listener: CardListenerRegistration = {
  id: 'M129-plowhorse-market-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!TRIGGER_SPACES.has(context.space?.id ?? '')) return
    if ((context.player.resources.food ?? 0) < 1) return
    return {
      flow: payGainFlow({
        cardId: CARD_ID,
        cost: { food: 1 },
        gain: { horse: 1 },
      }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M129_PlowhorseMarket = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Plowhorse Market",
    deck: "M",
    number: 129,
    category: "LIVESTOCK_PROVIDER",
    desc: [
        "Each time you use the \"Farmland\" or \"Cultivation\" action space, you can also buy exactly 1 horse for 1 food."
    ],
    cost: {
        "clay": 1
    },
    vp: 1,
    prerequisite: "1 Major Improvement",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M129_PlowhorseMarket_impl = M129_PlowhorseMarket.impl
