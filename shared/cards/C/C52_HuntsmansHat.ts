import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const huntsmansHatListener: CardListenerRegistration = {
  id: 'C52-huntsmans-hat-during',
  phases: ['during' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { actionId, state } = context
    
    if (actionId === 'sheep-market') {
      return {
        flow: {
          type: 'xor',
          children: [
            { type: 'leaf', actionId: 'gain', optional: false },
            { type: 'leaf', actionId: 'gain', optional: false },
          ],
        },
      }
    }
    
    if (actionId === 'pig-market') {
      const pigMarketSpace = state.actionSpaces.find(s => s.id === 'pig-market')
      const _pigsAvailable = pigMarketSpace?.resources.boar ?? 0
      return {
        flow: {
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'reap', optional: false },
          ],
        },
      }
    }
  },
}

registerCardListener(huntsmansHatListener)

export const C52_HuntsmansHat = new MinorImprovement({
  id: "C52_HuntsmansHat",
  name: "Huntsman's Hat",
  deck: "C",
  number: 52,
  category: "FOOD_PROVIDER",
  desc: ["For each new <PIG> you get from the effect of an action space, you also get 1 <FOOD>."],
  cost: { reed: 1 },
  prerequisite: "Cooking Improvement",
  newSet: true,
})
