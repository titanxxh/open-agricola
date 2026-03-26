import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'E21_SheepRug'
const WISH_CHILDREN_SPACE_IDS = [
  'wish-children',
  'wish-children-1',
  'wish-children-2',
  'wish-children-3',
  'wish-children-4',
  'wish-children-5',
  'urgent-wish-children',
  'urgent-wish-children-1',
  'urgent-wish-children-2',
  'urgent-wish-children-3',
  'urgent-wish-children-4',
  'urgent-wish-children-5',
]

/**
 * E21_SheepRug: You can use any Wish for Children action space, 
 * even if it is occupied by another player's person.
 */
const sheepRugCanUseOccupiedListener: CardListenerRegistration = {
  id: 'E21-sheep-rug-can-use-occupied',
  cardIds: [CARD_ID],
  phases: ['canUseOccupied' as ActionHookPhase],
  actions: WISH_CHILDREN_SPACE_IDS,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space.takenBy) return
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
  cost: { sheep: 1 },
  prerequisite: "4 Sheep",
})
