import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'B17_ForestPlow'

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

// B17 Forest Plow: After using a wood accumulation space, you can pay 2 wood to plow 1 field.
// Place the paid wood back on the accumulation space.
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

export const B17_ForestPlow = new MinorImprovement({
  id: CARD_ID,
  name: 'Forest Plow',
  deck: 'B',
  number: 17,
  category: 'FARM_PLANNER',
  desc: ['Each time after you use a wood accumulation space, you can pay 2 <WOOD> to plow 1 field. Place the paid <WOOD> on the accumulation space (for the next visitor).'],
  cost: { wood: 1 },
  newSet: true,
})

export const B17_ForestPlow_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
