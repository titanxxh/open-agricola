import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C145_ForestReviewer'

/**
 * C145 Forest Reviewer:
 * When any player uses an unoccupied Grove or Forest while the other
 * (Forest or Grove) is occupied, the card owner gets 1 reed.
 *
 * Logic: The triggering player places on 'forest' or 'grove'. We check
 * if the OTHER wood space is occupied (takenBy !== null).
 */
const PAIRED_SPACE: Record<string, string> = {
  forest: 'grove',
  grove: 'forest',
}

const listener: CardListenerRegistration = {
  id: 'C145-forest-reviewer-any-place-farmer',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId || !PAIRED_SPACE[spaceId]) return
    const otherSpaceId = PAIRED_SPACE[spaceId]!
    const otherSpace = context.state.actionSpaces.find((s) => s.id === otherSpaceId)
    if (!otherSpace || !otherSpace.takenBy) return
    return { flow: gainLeaf(CARD_ID, { reed: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const C145_ForestReviewer = new Occupation({
  id: CARD_ID,
  name: 'Forest Reviewer',
  deck: 'C',
  number: 145,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time any player uses the __Grove__ or __Forest__ while the other is occupied, you get 1 <REED>.',
  ],
  cost: {},
  players: '3+',
})
