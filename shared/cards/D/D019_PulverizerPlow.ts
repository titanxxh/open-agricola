import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'D019_PulverizerPlow'
const listener: CardListenerRegistration = {
  id: 'D19-pulverizer-plow-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gainPerRound = context.space?.gainPerRound ?? {}
    if ((gainPerRound.clay ?? 0) <= 0) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'return-to-space',
            params: { clay: 1 },
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

export const D019_PulverizerPlow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Pulverizer Plow',
    deck: 'D',
    number: 19,
    category: 'FARM_PLANNER',
    desc: [
        'Immediately after each time you use a clay accumulation space, you can pay 1 <CLAY> to plow 1 field. If you do, place that 1 <CLAY> on the accumulation space.',
      ],
    cost: { wood: 2 },
    prerequisite: '1 Occupation',
    occupationPrerequisites: { min: 1 },
  },
  impl: cardImpl,
})

export const D019_PulverizerPlow_impl = D019_PulverizerPlow.impl
