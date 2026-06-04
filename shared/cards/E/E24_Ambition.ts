import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { readImprovementTypes } from '../../actions/effects/improvement'

const CARD_ID = 'E24_Ambition'

/**
 * E24 Ambition — Each time you get a __Minor Improvement__ action on an action
 * space, you can build a major improvement instead of playing a minor one.
 *
 * BGA: onPlayerComputePlaceFarmerFlow — modifies the flow on MeetingPlace and
 * WishChildren action spaces to allow MAJOR in addition to MINOR improvements.
 *
 * Implementation: Use a computeReplace listener on the unified 'improvement'
 * action (gated to minor-only sub-flows via readImprovementTypes) and re-emit
 * with params.types: ['major','minor'] so the player can now also build major.
 * The BGA description says this only applies to literal Minor Improvement
 * action spaces (meeting-place, wish-children, urgent-wish-children).
 *
 * Prerequisite: 2 Occupations.
 */
const computeReplaceListener: CardListenerRegistration = {
  id: 'E24-ambition-replace-minor-improvement',
  cardIds: [CARD_ID],
  phases: ['computeReplace' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.actionContext?.checkedReplaceAction) return
    const types = readImprovementTypes(context)
    if (types.length !== 1 || types[0] !== 'minor') return
    const spaceId = context.space?.id
    if (spaceId !== 'meeting-place' && spaceId !== 'wish-children' && spaceId !== 'urgent-wish-children') return
    return {
      decline: true,
      alternativeFlow: {
        type: 'leaf',
        actionId: 'improvement',
        actionContext: { types: ['major', 'minor'] },
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [computeReplaceListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E24_Ambition = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Ambition',
    deck: 'E',
    number: 24,
    category: 'ACTION',
    desc: ['Each time you get a __Minor Improvement__ action on an action space, you can build a major improvement instead of playing a minor one.'],
    cost: {},
    prerequisite: '2 Occupations',
    occupationPrerequisites: { min: 2 },
  },
  impl: cardImpl,
})

export const E24_Ambition_impl = E24_Ambition.impl
