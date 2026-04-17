import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isSpaceOccupied } from '../../game/space'

const CARD_ID = 'E21_SheepRug'

/**
 * E21_SheepRug: You can use any Wish for Children action space, 
 * even if it is occupied by another player's person.
 */
const sheepRugCanUseOccupiedListener: CardListenerRegistration = {
  id: 'E21-sheep-rug-can-use-occupied',
  cardIds: [CARD_ID],
  phases: ['canUseOccupied' as ActionHookPhase],
  actions: ['wish-children', 'urgent-wish-children'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isSpaceOccupied(context.space)) return
    return { canUseOccupied: true }
  },
}

registerCardListener(sheepRugCanUseOccupiedListener)

export const E21_SheepRug = new MinorImprovement({
  id: CARD_ID,
  name: "Sheep Rug",
  deck: "E",
  number: 21,
  category: "FAMILY_GROWTH",
  desc: ["You can use any __Wish for Children__ action space, even if it is occupied by another player's person."],
  vp: 1,
  cost: { sheep: 1 },
  prerequisite: "4 Sheep",
})
