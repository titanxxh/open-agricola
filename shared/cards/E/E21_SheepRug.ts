import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'E21_SheepRug'

/**
 * E21_SheepRug: You can use any Wish for Children action space, 
 * even if it is occupied by another player's person.
 * 
 * Implementation: Use ComputeArgs hook to allow using occupied wish-children spaces
 * by not adding any restrictions when the space is occupied.
 */
const sheepRugComputeArgsListener: CardListenerRegistration = {
  id: 'E21-sheep-rug-compute-args',
  cardIds: [CARD_ID],
  phases: ['computeArgs' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { space, player } = context
    
    // Only apply to wish-children spaces
    const wishForChildrenSpaces = [
      'wish-children', 
      'wish-children-1', 
      'wish-children-2', 
      'wish-children-3', 
      'wish-children-4', 
      'wish-children-5'
    ]
    
    if (!wishForChildrenSpaces.includes(space.id)) return
    
    // Check if player has this card
    if (!player.minorPlayed.includes(CARD_ID)) return
    
    // The card allows using occupied wish-children spaces
    // No extra cost required by card description
    // Just return empty to indicate this player can use this space
    return {
      // No additional costs - the card simply allows using occupied spaces
    }
  },
}

registerCardListener(sheepRugComputeArgsListener)

export const E21_SheepRug = new MinorImprovement({
  id: CARD_ID,
  name: "Sheep Rug",
  deck: "E",
  number: 21,
  category: "FAMILY_GROWTH",
  desc: ["You can use any __Wish for Children__ action space, even if it is occupied by another player's person."],
  cost: { sheep: 1 },
  prerequisite: "4 Sheep",
})
