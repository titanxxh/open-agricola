import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'B017_ForestPlow'
const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'B17-forest-plow-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'return-to-space',
            params: { wood: 2 },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'plow',
            sourceCard: CARD_ID,
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

export const B017_ForestPlow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Forest Plow',
    deck: 'B',
    number: 17,
    category: 'FARM_PLANNER',
    desc: ['Each time after you use a <WOOD> accumulation space, you can pay 2 <WOOD> to plow 1 <FIELD>. Place the paid <WOOD> on the accumulation space (for the next visitor).'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const B017_ForestPlow_impl = B017_ForestPlow.impl
