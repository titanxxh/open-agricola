import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'A95_Angler'

// A95 Angler: After using the Fishing accumulation space while there are at most 2 food on
// that space (before collecting), get a Major or Minor Improvement action.
// BGA checks count($event['meeples']) <= 2 which maps to food on the space before collection.
const listener: CardListenerRegistration = {
  id: 'A95-angler-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    // The food was on the space before collecting - check the resources that were gained
    // BGA check: count($event['meeples']) <= 2 means ≤2 food was on the space
    const foodGained = (context.result?.type === 'ok'
      ? (context.result.resourcesGained?.food ?? 0)
      : 0)
    if (foodGained > 2) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'improvement-any',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const A95_Angler = new Occupation({
  id: CARD_ID,
  name: 'Angler',
  deck: 'A',
  number: 95,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each time after you use the __Fishing__ Accumulation space while there are at most 2 <FOOD> on that space, you get a __Major or Minor Improvement__ action.'],
  cost: {},
  players: '1+',
  newSet: true,
})
