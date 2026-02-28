import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const ANIMAL_SPACES = ['sheep-market', 'pig-market', 'cattle-market']

const getAnimalCount = (player: any): number => {
  return (player.houseAnimalCount ?? 0) + 
    Object.values(player.stableAnimals ?? {}).filter((a: any) => a !== null).length +
    Object.values(player.pastures ?? []).reduce((sum: number, p: any) => sum + (p.animalCount ?? 0), 0)
}

const reclamationPlowDuringListener: CardListenerRegistration = {
  id: 'A17-reclamation-plow-during',
  phases: ['during' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { space, player } = context
    
    if (!ANIMAL_SPACES.includes(space.id)) return
    
    const cardState = player.cardStates?.['A17_ReclamationPlow'] ?? {}
    if (cardState.flagged) return
    
    const currentAnimals = getAnimalCount(player)
    return {
      extraData: { animalsBeforeCollecting: currentAnimals },
    }
  },
}

const reclamationPlowAfterListener: CardListenerRegistration = {
  id: 'A17-reclamation-plow-after',
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { space, player, extraData } = context
    
    if (!ANIMAL_SPACES.includes(space.id)) return
    
    const cardState = player.cardStates?.['A17_ReclamationPlow'] ?? {}
    if (cardState.flagged) return
    
    const animalsBeforeCollecting = extraData?.['animalsBeforeCollecting'] as number | undefined
    if (animalsBeforeCollecting === undefined) return
    
    const obtainedAnimals = (context.result?.resourcesGained?.sheep ?? 0) +
      (context.result?.resourcesGained?.boar ?? 0) +
      (context.result?.resourcesGained?.cattle ?? 0)
    
    if (obtainedAnimals <= 0) return
    
    const animalsAfterCollecting = getAnimalCount(player)
    const canAccommodate = animalsAfterCollecting >= animalsBeforeCollecting + obtainedAnimals
    
    if (!canAccommodate) return
    
    return {
      flow: {
        type: 'xor',
        children: [
          { 
            type: 'seq', 
            children: [
              { type: 'leaf', actionId: 'plow', optional: false },
              { type: 'leaf', actionId: 'special-effect', optional: false },
            ]
          },
          { type: 'leaf', actionId: 'pass', optional: false },
        ],
      },
    }
  },
}

registerCardListener(reclamationPlowDuringListener)
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
