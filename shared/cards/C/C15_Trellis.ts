import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'C15_Trellis'

// C15 Trellis: Before using Pig Market, can take a fencing action (pay wood as usual).
const listener: CardListenerRegistration = {
  id: 'C15-trellis-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'pig-market') return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'fencing',
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const C15_Trellis = new MinorImprovement({
  id: CARD_ID,
  name: 'Trellis',
  deck: 'C',
  number: 15,
  category: 'FARM_PLANNER',
  desc: ['Each time before you use the __Pig Market__ accumulation space, you can take a __Build Fences__ action. (You must pay <WOOD> for the fences as usual.)'],
  cost: {},
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  newSet: true,
})
