import { defineMinorCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M098_FishSmokehouse'

const listener: CardListenerRegistration = {
  id: 'M098-fish-smokehouse-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    if ((context.player.resources.fuel ?? 0) < 1) return
    return {
      flow: payGainFlow({
        cardId: CARD_ID,
        cost: { fee: { fuel: 1 } },
        gain: { food: 3 },
      }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M098_FishSmokehouse = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Fish Smoke-house",
    deck: "M",
    number: 98,
    category: "FOOD_PROVIDER",
    desc: [
        "Each time you use the \"Fishing\" accumulation space, you can pay 1 fuel to get an additional 3 food."
    ],
    cost: {
        "wood": 1,
        "clay": 2
    },
    vp: 2,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M098_FishSmokehouse_impl = M098_FishSmokehouse.impl
