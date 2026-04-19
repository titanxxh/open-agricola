import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'A23_StoneCompany'

const QUARRY_SPACES = new Set(['eastern-quarry', 'western-quarry'])

// A23 Stone Company: After using a Quarry accumulation space, get a Major or Minor Improvement
// action during which you must spend at least 1 stone.
const listener: CardListenerRegistration = {
  id: 'A23-stone-company-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !QUARRY_SPACES.has(context.space.id)) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'improvement-any',
            sourceCard: CARD_ID,
            actionContext: { purchaseCondition: CARD_ID },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const A23_StoneCompany = new MinorImprovement({
  id: CARD_ID,
  name: "Stone Company",
  deck: "A",
  number: 23,
  category: "ACTIONS_BOOSTER",
  desc: ["Immediately after each time you use a __Quarry__ accumulation space, you get a __Major or Minor Improvement__ action during which you must spend at least 1 <STONE>."],
  cost: { clay: 2, reed: 1 },
  vp: 1,
})
