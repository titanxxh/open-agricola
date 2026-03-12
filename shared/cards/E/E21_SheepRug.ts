import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'E21_SheepRug'

/**
 * E21_SheepRug: You can use any Wish for Children action space, 
 * even if it is occupied by another player's person.
 * 
 * Implementation: Use isDoable hook to allow using occupied wish-children spaces.
 */
const sheepRugIsDoableListener: CardListenerRegistration = {
  id: 'E21-sheep-rug-is-doable',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['wish-children', 'wish-children-1', 'wish-children-2', 'wish-children-3', 'wish-children-4', 'wish-children-5', 'urgent-wish-children', 'urgent-wish-children-1', 'urgent-wish-children-2', 'urgent-wish-children-3', 'urgent-wish-children-4', 'urgent-wish-children-5'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const { player } = context
    
    // Check if player has this card played
    if (!player.minorPlayed.includes(CARD_ID)) return
    
    // The card allows using occupied wish-children spaces
    return {
      doable: true,
    }
  },
}

registerCardListener(sheepRugIsDoableListener)

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
