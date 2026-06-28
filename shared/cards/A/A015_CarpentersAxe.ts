import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'A015_CarpentersAxe'
const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'A15-carpenters-axe-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    if ((context.player.resources.wood ?? 0) < 7) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'stables',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { max: 1, exactCost: { wood: 1, max: 1 } },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A015_CarpentersAxe = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Carpenter's Axe",
    deck: 'A',
    number: 15,
    category: 'FARM_PLANNER',
    desc: ["Each time after you use a wood accumulation space, if you then have at least 7 <WOOD> in your supply, you can build exactly 1 stable for 1 <WOOD>."],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const A015_CarpentersAxe_impl = A015_CarpentersAxe.impl
