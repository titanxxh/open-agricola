import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { readImprovementTypes } from '../../actions/effects/improvement'
import { getAvailableMajorImprovementIds } from '../major/supply'

const CARD_ID = 'E024_Ambition'

/**
 * E24 Ambition — Each time you get a __Minor Improvement__ action on an action
 * space, you can build a major improvement instead of playing a minor one.
 *
 * Rule: onPlayerComputePlaceFarmerFlow — modifies the flow on MeetingPlace and
 * WishChildren action spaces to allow MAJOR in addition to MINOR improvements.
 *
 * Implementation: inject available major improvements into literal Minor
 * Improvement actions through computeChoiceCandidates.
 *
 * Prerequisite: 2 Occupations.
 */
const choiceCandidateListener: CardListenerRegistration = {
  id: 'E24-ambition-compute-choice-candidates',
  cardIds: [CARD_ID],
  phases: ['computeChoiceCandidates' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard || context.trueAction === false) return
    const types = readImprovementTypes(context)
    if (types.length !== 1 || types[0] !== 'minor') return
    const extraOptions = getAvailableMajorImprovementIds(context.state).map((id) => ({
      value: id,
      labelKey: `improvements.${id}.name`,
    }))
    if (extraOptions.length === 0) return
    return { extraOptions }
  },
}

const cardImpl = {
  listeners: [choiceCandidateListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E024_Ambition = defineMinorCard({
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

export const E024_Ambition_impl = E024_Ambition.impl
