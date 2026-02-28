import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const boarSpearDuringListener: CardListenerRegistration = {
  id: 'E53-boar-spear-during',
  phases: ['during' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { actionId, result } = context
    
    if (actionId !== 'collect') return
    
    const obtainedBoar = result?.resourcesGained?.boar ?? 0
    if (obtainedBoar <= 0) return
    
    return {
      flow: {
        type: 'xor',
        children: [
          { type: 'leaf', actionId: 'exchange', optional: true },
        ],
      },
    }
  },
}

registerCardListener(boarSpearDuringListener)

export const E53_BoarSpear = new MinorImprovement({
  id: "E53_BoarSpear",
  name: "Boar Spear",
  deck: "E",
  number: 53,
  category: "FOOD",
  desc: ["Each time you get at least 1 <PIG> outside of the breeding phase of a harvest, you can immediately turn them into 4 <FOOD> each."],
  cost: {"wood":1,"stone":1},
})
