import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

const claypipeAfterListener: CardListenerRegistration = {
  id: 'A53-claypipe-after',
  phases: ['after' as ActionHookPhase],
  actions: ['collect', 'gain'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { state, player } = context
    
    if (!player.minorPlayed.includes('A53_Claypipe')) return
    
    const workPhaseResources = state.workPhaseObtainedResources?.[player.id] ?? {}
    let totalBuilding = 0
    for (const res of BUILDING_RESOURCES) {
      totalBuilding += workPhaseResources[res] ?? 0
    }
    
    if (totalBuilding >= 7) {
      return {
        flow: {
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'gain-food', optional: false },
          ],
        },
      }
    }
  },
}

registerCardListener(claypipeAfterListener)

export const A53_Claypipe = new MinorImprovement({
  id: "A53_Claypipe",
  name: "Claypipe",
  deck: "A",
  number: 53,
  category: "FOOD_PROVIDER",
  desc: ["In the returning home phase of each round, if you gained at least 7 building resources in the preceding work phase, you get 2 <FOOD>."],
  cost: {"clay":1},
})
