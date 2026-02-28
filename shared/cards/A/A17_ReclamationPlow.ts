import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

type AnimalType = 'sheep' | 'boar' | 'cattle'

const isAnimalAccumulationSpace = (space: any): boolean => {
  const gainPerRound = space.gainPerRound ?? {}
  return (gainPerRound.sheep ?? 0) > 0 || 
         (gainPerRound.boar ?? 0) > 0 || 
         (gainPerRound.cattle ?? 0) > 0
}

const getAnimalCountByType = (player: any): Record<AnimalType, number> => {
  return {
    sheep: (player.houseAnimalType === 'sheep' ? player.houseAnimalCount : 0) +
      Object.values(player.stableAnimals ?? {}).filter((a: any) => a === 'sheep').length +
      (player.pastures ?? []).reduce((sum: number, p: any) => sum + (p.animalType === 'sheep' ? p.animalCount : 0), 0),
    boar: (player.houseAnimalType === 'boar' ? player.houseAnimalCount : 0) +
      Object.values(player.stableAnimals ?? {}).filter((a: any) => a === 'boar').length +
      (player.pastures ?? []).reduce((sum: number, p: any) => sum + (p.animalType === 'boar' ? p.animalCount : 0), 0),
    cattle: (player.houseAnimalType === 'cattle' ? player.houseAnimalCount : 0) +
      Object.values(player.stableAnimals ?? {}).filter((a: any) => a === 'cattle').length +
      (player.pastures ?? []).reduce((sum: number, p: any) => sum + (p.animalType === 'cattle' ? p.animalCount : 0), 0),
  }
}

const reclamationPlowDuringListener: CardListenerRegistration = {
  id: 'A17-reclamation-plow-during',
  phases: ['during' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { space, player } = context
    
    if (!isAnimalAccumulationSpace(space.id)) return
    
    const cardState = player.cardStates?.['A17_ReclamationPlow'] ?? {}
    if (cardState.flagged) return
    
    const currentAnimals = getAnimalCountByType(player)
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
    
    if (!isAnimalAccumulationSpace(space.id)) return
    
    const cardState = player.cardStates?.['A17_ReclamationPlow'] ?? {}
    if (cardState.flagged) return
    
    const animalsBeforeCollecting = extraData?.['animalsBeforeCollecting'] as Record<AnimalType, number> | undefined
    if (!animalsBeforeCollecting) return
    
    const obtainedAnimals: Record<AnimalType, number> = {
      sheep: context.result?.resourcesGained?.sheep ?? 0,
      boar: context.result?.resourcesGained?.boar ?? 0,
      cattle: context.result?.resourcesGained?.cattle ?? 0,
    }
    
    const totalObtained = obtainedAnimals.sheep + obtainedAnimals.boar + obtainedAnimals.cattle
    if (totalObtained <= 0) return
    
    const animalsAfterCollecting = getAnimalCountByType(player)
    
    let canAccommodate = true
    let hasCooking = false
    
    for (const animalType of ['sheep', 'boar', 'cattle'] as AnimalType[]) {
      const before = animalsBeforeCollecting[animalType]
      const after = animalsAfterCollecting[animalType]
      const obtained = obtainedAnimals[animalType]
      
      if (after < obtained) {
        canAccommodate = false
        break
      }
      
      if (after < before + obtained) {
        hasCooking = true
      }
    }
    
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
