import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const sheepRugComputeArgsListener: CardListenerRegistration = {
  id: 'E21-sheep-rug-compute-args',
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { space, player, state } = context
    
    const spaceId = space.id
    const wishForChildrenSpaces = ['wish-children', 'wish-children-1', 'wish-children-2', 'wish-children-3', 'wish-children-4', 'wish-children-5']
    
    if (!wishForChildrenSpaces.includes(spaceId)) return
    
    const occupiedByOther = state.players.some(
      (p) => p.id !== player.id && p.workersAvailable === 0,
    )
    
    if (!occupiedByOther) return
    
    if ((player.resources.food ?? 0) < 1) return
    if ((player.resources.sheep ?? 0) < 1) return
    
    return {
      costs: { food: -1, sheep: -1 },
    }
  },
}

registerCardListener(sheepRugComputeArgsListener)

export const E21_SheepRug = new MinorImprovement({
  id: "E21_SheepRug",
  name: "Sheep Rug",
  deck: "E",
  number: 21,
  category: "FOOD_PROVIDER",
  desc: ["You you can use any __Wish for Children__ action space, even if it is occupied by another player. Instead of paying 1 <FOOD>, you pay 1 <SHEEP>."],
  cost: { sheep: 1 },
  prerequisite: "4 Sheep",
  implemented: true,
})
