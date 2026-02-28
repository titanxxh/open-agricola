import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const RECLAMATION_PLOW_FLAG = 'reclamation-plow-pending'

const reclamationPlowAfterListener: CardListenerRegistration = {
  id: 'A17-reclamation-plow-after',
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { actionId, result, player } = context
    
    if (actionId !== 'collect') return
    
    const animals = ['sheep', 'boar', 'cattle'] as const
    let totalObtained = 0
    for (const animal of animals) {
      totalObtained += result?.resourcesGained?.[animal] ?? 0
    }
    
    if (totalObtained <= 0) return
    
    const canAccommodate = 
      (player.houseAnimalType !== null && player.houseAnimalCount < player.rooms * 2) ||
      Object.values(player.stableTiles).some(t => t === null)
    
    if (!canAccommodate) return
    
    return {
      flow: {
        type: 'xor',
        children: [
          { type: 'leaf', actionId: 'plow', optional: true },
        ],
      },
    }
  },
}

registerCardListener(reclamationPlowAfterListener)

export const A17_ReclamationPlow = new MinorImprovement({
  id: "A17_ReclamationPlow",
  name: "Reclamation Plow",
  deck: "A",
  number: 17,
  category: "FARM_PLANNER",
  desc: ["After the next time you take animals from an accumulation space and accommodate all of them on your farm, you can plow 1 field."],
  cost: {"wood":1},
})
