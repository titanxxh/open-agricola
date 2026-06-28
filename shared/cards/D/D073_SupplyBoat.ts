import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D073_SupplyBoat'
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D073_SupplyBoat = defineMinorCard({
  meta: {
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
  },
  impl: cardImpl,
})

export const D073_SupplyBoat_impl = D073_SupplyBoat.impl
