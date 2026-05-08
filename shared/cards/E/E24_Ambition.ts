import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { E24_Ambition } from '../../cards-display/E/E24_Ambition'
export { E24_Ambition }

const CARD_ID = E24_Ambition.id

/**
 * E24 Ambition — Each time you get a __Minor Improvement__ action on an action
 * space, you can build a major improvement instead of playing a minor one.
 *
 * BGA: onPlayerComputePlaceFarmerFlow — modifies the flow on MeetingPlace and
 * WishChildren action spaces to allow MAJOR in addition to MINOR improvements.
 *
 * Implementation: Use a computeReplace listener on 'minor-improvement' that
 * substitutes 'improvement-any' when this card is played.
 * The BGA description says this only applies to literal Minor Improvement action
 * spaces (meeting-place, wish-children, and the dedicated minor-improvement space).
 *
 * Prerequisite: 2 Occupations.
 */
const computeReplaceListener: CardListenerRegistration = {
  id: 'E24-ambition-replace-minor-improvement',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Only replace when on meeting-place or wish-children action spaces
    const spaceId = context.space?.id
    if (spaceId !== 'meeting-place' && spaceId !== 'wish-children' && spaceId !== 'urgent-wish-children') return
    return {
      actionId: 'improvement-any',
      sourceCard: CARD_ID,
    }
  },
}

export const E24_Ambition_impl = {
  listeners: [computeReplaceListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
