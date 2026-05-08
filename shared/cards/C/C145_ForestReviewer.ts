import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'
import { C145_ForestReviewer } from '../../cards-display/C/C145_ForestReviewer'
export { C145_ForestReviewer }

const CARD_ID = C145_ForestReviewer.id

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
    if (!otherSpace || !isSpaceOccupied(otherSpace)) return
    return { flow: gainLeaf(CARD_ID, { reed: 1 }), sourceCard: CARD_ID }
  },
}

export const C145_ForestReviewer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
