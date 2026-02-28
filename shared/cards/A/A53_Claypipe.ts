import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getWorkPhaseBuildingResources } from '../../logic/state'

const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

const claypipeImmediatelyAfterListener: CardListenerRegistration = {
  id: 'A53-claypipe-immediately-after',
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['collect', 'gain'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { player, result } = context
    
    if (!player.minorPlayed.includes('A53_Claypipe')) return
    if (result?.type !== 'ok') return
    
    const gainedResources = result.resourcesGained ?? {}
    let buildingGained = 0
    for (const res of BUILDING_RESOURCES) {
      buildingGained += gainedResources[res] ?? 0
    }
    
    if (buildingGained <= 0) return
    
    const currentCount = player.cardStates?.['A53_Claypipe']?.counters?.['buildingResources'] ?? 0
    const newCount = currentCount + buildingGained
    
    return {
      extraData: { 
        incrementBuildingCount: buildingGained,
      },
    }
  },
}

const claypipeAfterListener: CardListenerRegistration = {
  id: 'A53-claypipe-after',
  phases: ['after' as ActionHookPhase],
  actions: ['collect', 'gain'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { player } = context
    
    if (!player.minorPlayed.includes('A53_Claypipe')) return
    
    const cardState = player.cardStates?.['A53_Claypipe'] ?? {}
    const buildingCount = cardState.counters?.['buildingResources'] ?? 0
    
    if (buildingCount >= 7) {
      return {
        flow: {
          type: 'seq',
          children: [
            { type: 'leaf', actionId: 'gain-food', optional: false },
          ],
        },
        extraData: { resetBuildingCount: true },
      }
    }
  },
}

registerCardListener(claypipeImmediatelyAfterListener)
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
