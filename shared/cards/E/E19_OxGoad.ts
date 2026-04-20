import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E19_OxGoad'

// After using Cattle Market, optional pay 2 food → plow 1 field.
const listener: CardListenerRegistration = {
  id: 'E19-ox-goad-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'cattle-market') return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
          { type: 'leaf', actionId: 'plow' },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E19_OxGoad = new MinorImprovement({
  id: CARD_ID,
  name: 'Ox Goad',
  deck: 'E',
  number: 19,
  category: 'FARM_PLANNER',
  desc: ['Each time after you use the __Cattle Market__ accumulation space, you can pay 2 <FOOD> to plow 1 field.'],
  cost: { wood: 1 },
  vp: 1,
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})

export const E19_OxGoad_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
