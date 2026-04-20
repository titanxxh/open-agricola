import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D73_SupplyBoat'

// D73 Supply Boat: Each time after you use the Fishing accumulation space,
// you can choose to buy 1 GRAIN for 1 FOOD, or 1 VEGETABLE for 3 FOOD.
const listener: CardListenerRegistration = {
  id: 'D73-supply-boat-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    return {
      flow: {
        type: 'xor',
        optional: true,
        children: [
          payGainNode({ cardId: CARD_ID, cost: { food: 1 }, gain: { grain: 1 } }).flow!,
          payGainNode({ cardId: CARD_ID, cost: { food: 3 }, gain: { vegetable: 1 } }).flow!,
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D73_SupplyBoat = new MinorImprovement({
  id: CARD_ID,
  name: 'Supply Boat',
  deck: 'D',
  number: 73,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time after you use the __Fishing__ accumulation space, you can choose to buy 1 <GRAIN> for 1 <FOOD>, or 1 <VEGETABLE> for 3 <FOOD>.',
  ],
  cost: { wood: 1 },
  vp: 1,
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
})

export const D73_SupplyBoat_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
