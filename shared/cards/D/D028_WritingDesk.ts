import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { isLessonsSpaceId } from '../helpers/lessons-spaces'

const CARD_ID = 'D028_WritingDesk'

const listener: CardListenerRegistration = {
  id: 'D28-writing-desk-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!isLessonsSpaceId(spaceId)) return
    // Need at least 2 occupations in hand (one for main Lessons, one for Writing Desk)
    if ((context.player.occupationHand?.length ?? 0) < 2) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'occupation',
        optional: true,
        sourceCard: CARD_ID,
        params: { exactCost: { food: 2 } },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D028_WritingDesk = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Writing Desk',
    deck: 'D',
    number: 28,
    category: 'ACTIONS_BOOSTER',
    desc: ['Each time you use a __Lessons__ action space, you can play 1 additional occupation for an occupation cost of 2 <FOOD>.'],
    cost: { wood: 1 },
    vp: 1,
    prerequisite: '2 Occupations',
    occupationPrerequisites: { min: 2 },
  },
  impl: cardImpl,
})

export const D028_WritingDesk_impl = D028_WritingDesk.impl
